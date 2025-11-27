import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "../../../../../server/lib/prisma";
import { hasStripeConfig, getStripeClient } from "../../../../../server/lib/stripe";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../../../../../server/lib/twilio";

export const runtime = "nodejs"; // Ensure we're using Node.js runtime for raw body access

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("💳 [STRIPE WEBHOOK] Processing checkout.session.completed");
  console.log("   Session ID:", session.id);
  console.log("   Payment status:", session.payment_status);
  console.log("   Metadata:", JSON.stringify(session.metadata, null, 2));

  const ticketId = session.metadata?.ticketId;
  const tenantId = session.metadata?.tenantId;

  if (!ticketId || !tenantId) {
    console.error("❌ [STRIPE WEBHOOK] Missing ticketId or tenantId in session metadata");
    return;
  }

  const stripe = getStripeClient();
  
  let paymentLinkId: string | null = null;
  try {
    if (session.payment_link) {
      paymentLinkId =
        typeof session.payment_link === "string" ? session.payment_link : session.payment_link.id;
    }
  } catch (error) {
    console.error("❌ [STRIPE WEBHOOK] Failed to get payment link from session:", error);
  }

  // Find payment record
  let payment = await prisma.payment.findFirst({
    where: {
      ticketId,
      tenantId,
      ...(paymentLinkId ? { stripeLinkId: paymentLinkId } : {}),
      status: { in: ["PENDING", "PAYMENT_LINK_SENT"] },
    },
    include: {
      ticket: {
        include: {
          location: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // If not found by payment link, try finding by ticketId
  if (!payment) {
    console.log("🔍 [STRIPE WEBHOOK] Payment not found by payment link, searching by ticketId");
    payment = await prisma.payment.findFirst({
      where: {
        ticketId,
        tenantId,
        status: { in: ["PENDING", "PAYMENT_LINK_SENT"] },
      },
      include: {
        ticket: {
          include: {
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  if (!payment) {
    console.error("❌ [STRIPE WEBHOOK] Payment record not found for ticketId:", ticketId);
    return;
  }

  console.log("✅ [STRIPE WEBHOOK] Found payment:", {
    paymentId: payment.id,
    ticketNumber: payment.ticket.ticketNumber,
    currentStatus: payment.status,
    amountCents: payment.amountCents,
  });

  // Only update if payment was successful
  if (session.payment_status === "paid") {
    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          stripeCheckoutSessionId: session.id,
          stripeCustomerId: session.customer as string | undefined,
          completedVia: "webhook",
          completedAt: new Date().toISOString(),
        },
      },
    });

    console.log("✅ [STRIPE WEBHOOK] Payment updated to COMPLETED:", {
      paymentId: updatedPayment.id,
      completedAt: updatedPayment.completedAt,
    });

    // Update ticket's amountPaidCents
    const allCompletedPayments = await prisma.payment.findMany({
      where: {
        ticketId: payment.ticketId,
        status: "COMPLETED",
      },
      select: {
        amountCents: true,
      },
    });

    const totalPaidCents = allCompletedPayments.reduce((sum, p) => sum + p.amountCents, 0);

    await prisma.ticket.update({
      where: { id: payment.ticketId },
      data: {
        amountPaidCents: totalPaidCents,
      },
    });

    console.log("✅ [STRIPE WEBHOOK] Ticket amountPaidCents updated:", totalPaidCents);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId: payment.tenantId,
        ticketId: payment.ticketId,
        userId: null,
        action: "PAYMENT_COMPLETED",
        details: {
          paymentId: payment.id,
          ticketNumber: payment.ticket.ticketNumber,
          amountCents: payment.amountCents,
          stripeCheckoutSessionId: session.id,
          completedVia: "webhook",
        },
      },
    });

    // Send confirmation SMS to customer
    if (
      payment.ticket.customerPhone &&
      hasTwilioConfig &&
      !isSmsSendingDisabled
    ) {
      try {
        const amountDisplay = (payment.amountCents / 100).toFixed(2);
        const confirmationMessage = `Payment confirmed! You paid $${amountDisplay} for ticket ${payment.ticket.ticketNumber}. Reply YES to request your car now.`;

        await sendSms({
          to: payment.ticket.customerPhone,
          body: confirmationMessage,
        });

        await prisma.message.create({
          data: {
            tenantId: payment.tenantId,
            ticketId: payment.ticketId,
            direction: "OUTBOUND",
            body: confirmationMessage,
            deliveryStatus: "SENT",
            metadata: {
              automated: true,
              reason: "payment_confirmation",
              paymentId: payment.id,
            },
          },
        });

        console.log("✅ [STRIPE WEBHOOK] Payment confirmation SMS sent");
      } catch (smsError) {
        console.error("❌ [STRIPE WEBHOOK] Failed to send payment confirmation SMS:", smsError);
      }
    }
  } else {
    console.log("ℹ️ [STRIPE WEBHOOK] Payment status is not 'paid', skipping update:", session.payment_status);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("💳 [STRIPE WEBHOOK] Processing payment_intent.succeeded");
  console.log("   Payment Intent ID:", paymentIntent.id);
  console.log("   Amount:", paymentIntent.amount);
  console.log("   Metadata:", JSON.stringify(paymentIntent.metadata, null, 2));

  console.log("ℹ️ [STRIPE WEBHOOK] payment_intent.succeeded - handled by checkout.session.completed");
}

export async function POST(req: NextRequest) {
  console.log("=".repeat(80));
  console.log("🔔 [STRIPE WEBHOOK] Received webhook event");
  console.log("   Timestamp:", new Date().toISOString());
  console.log("   Headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

  if (!hasStripeConfig) {
    console.error("❌ [STRIPE WEBHOOK] Stripe is not configured");
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Get the signature from the request headers
  const signature = req.headers.get("stripe-signature") || undefined;

  let event: Stripe.Event;

  try {
    // Get raw body as text for signature verification
    const body = await req.text();
    const bodyBuffer = Buffer.from(body);

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(bodyBuffer, signature, webhookSecret);
        console.log("✅ [STRIPE WEBHOOK] Signature verified");
      } catch (err) {
        console.error("❌ [STRIPE WEBHOOK] Signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      // For local testing without webhook secret, parse event directly
      // WARNING: This is insecure and should only be used for local development
      console.warn("⚠️ [STRIPE WEBHOOK] No webhook secret configured - skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log("📋 [STRIPE WEBHOOK] Event type:", event.type);
    console.log("   Event ID:", event.id);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      default:
        console.log(`ℹ️ [STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
    }

    console.log("✅ [STRIPE WEBHOOK] Event processed successfully");
    console.log("=".repeat(80));
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("❌ [STRIPE WEBHOOK] Error processing webhook:", error);
    console.error("   Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.log("=".repeat(80));
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

