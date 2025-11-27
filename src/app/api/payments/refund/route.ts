import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole, Prisma } from "../../../../../src/generated/prisma/client";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { hasStripeConfig, getStripeClient } from "../../../../../server/lib/stripe";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../../../../../server/lib/twilio";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const refundSchema = z.object({
  paymentId: z.string(),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins and managers can refund
  if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.MANAGER) {
    return NextResponse.json({ error: "Only admins and managers can process refunds" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid refund payload" }, { status: 400 });
  }

  const { paymentId, amountCents, reason } = parsed.data;

  try {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId: session.tenantId,
      },
      include: {
        ticket: {
          include: {
            location: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "COMPLETED") {
      return NextResponse.json({ error: "Only completed payments can be refunded" }, { status: 400 });
    }

    if (payment.refundAmountCents && payment.refundAmountCents >= payment.amountCents) {
      return NextResponse.json({ error: "Payment has already been fully refunded" }, { status: 400 });
    }

    const refundAmountCents = amountCents ?? payment.amountCents;
    const alreadyRefunded = payment.refundAmountCents ?? 0;
    const remainingRefundable = payment.amountCents - alreadyRefunded;

    if (refundAmountCents > remainingRefundable) {
      return NextResponse.json({
        error: `Cannot refund more than $${(remainingRefundable / 100).toFixed(2)}. $${((alreadyRefunded) / 100).toFixed(2)} has already been refunded.`,
      }, { status: 400 });
    }

    if (!hasStripeConfig) {
      return NextResponse.json({ error: "Stripe is not configured. Cannot process refund." }, { status: 500 });
    }

    const stripe = getStripeClient();

    // Get payment sessions from the payment link to find the payment intent
    let paymentIntentId: string | null = null;
    try {
      const paymentLink = await stripe.paymentLinks.retrieve(payment.stripeLinkId);
      const checkoutSessions = await stripe.checkout.sessions.list({
        payment_link: paymentLink.id,
        limit: 1,
      });

      if (checkoutSessions.data.length > 0 && checkoutSessions.data[0].payment_intent) {
        paymentIntentId =
          typeof checkoutSessions.data[0].payment_intent === "string"
            ? checkoutSessions.data[0].payment_intent
            : checkoutSessions.data[0].payment_intent.id;
      }
    } catch (error) {
      console.error("Failed to retrieve payment intent from payment link", error);
    }

    if (!paymentIntentId) {
      console.warn(`Could not find payment intent for payment ${paymentId}. Recording refund in database only.`);
    }

    let stripeRefundId: string | null = null;
    if (paymentIntentId) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: refundAmountCents,
          reason: reason ? "requested_by_customer" : undefined,
          metadata: {
            paymentId: payment.id,
            ticketId: payment.ticketId,
            tenantId: session.tenantId,
            refundedBy: session.user.id,
            reason: reason ?? "No reason provided",
          },
        });
        stripeRefundId = refund.id;
      } catch (error) {
        console.error("Failed to create Stripe refund", error);
        return NextResponse.json({
          error: "Failed to process refund in Stripe. Please try again or contact support.",
        }, { status: 500 });
      }
    }

    const newRefundAmount = (payment.refundAmountCents ?? 0) + refundAmountCents;
    const isFullyRefunded = newRefundAmount >= payment.amountCents;

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        refundAmountCents: newRefundAmount,
        refundedAt: newRefundAmount >= payment.amountCents ? new Date() : payment.refundedAt ?? new Date(),
        status: isFullyRefunded ? "REFUNDED" : payment.status,
        stripeRefundId: stripeRefundId ?? payment.stripeRefundId,
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          refunds: [
            ...((payment.metadata as Record<string, unknown>)?.refunds as Array<unknown> ?? []),
            {
              amountCents: refundAmountCents,
              refundedAt: new Date().toISOString(),
              refundedBy: session.user.id,
              refundedByName: session.user.name,
              stripeRefundId,
              reason: reason ?? null,
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        ticketId: payment.ticketId,
        userId: session.userId ?? null,
        action: "PAYMENT_REFUNDED",
        details: {
          ticketNumber: payment.ticket.ticketNumber,
          paymentId: payment.id,
          refundAmountCents,
          totalRefundedCents: newRefundAmount,
          isFullRefund: isFullyRefunded,
          stripeRefundId,
          reason: reason ?? null,
        },
      },
    });

    // Send SMS confirmation to customer if phone number exists
    if (payment.ticket.customerPhone && hasTwilioConfig && !isSmsSendingDisabled) {
      try {
        const refundAmountDisplay = currencyFormatter.format(refundAmountCents / 100);
        const messageBody = `ValetPro: Your refund of $${refundAmountDisplay} for ticket ${payment.ticket.ticketNumber} has been processed. ${isFullyRefunded ? "This was a full refund." : "This was a partial refund."}${stripeRefundId ? ` Refund ID: ${stripeRefundId}` : ""}`;

        await sendSms({
          to: payment.ticket.customerPhone,
          body: messageBody,
        });

        await prisma.message.create({
          data: {
            tenantId: session.tenantId,
            ticketId: payment.ticketId,
            direction: "OUTBOUND",
            body: messageBody,
            deliveryStatus: "SENT",
            metadata: {
              paymentId: payment.id,
              refundAmountCents,
              isFullRefund: isFullyRefunded,
              stripeRefundId,
              automated: true,
              reason: "refund_confirmation",
            },
          },
        });
      } catch (smsError) {
        console.error("Failed to send refund confirmation SMS", smsError);
        // Don't fail the refund if SMS fails
      }
    }

    return NextResponse.json({
      payment: updatedPayment,
      refundAmountCents,
      isFullRefund: isFullyRefunded,
    });
  } catch (error) {
    console.error("Failed to process refund", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}

