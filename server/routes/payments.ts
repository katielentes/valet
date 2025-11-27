import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { hasStripeConfig, getStripeClient } from "../lib/stripe";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../lib/twilio";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { Ticket, Location, UserRole, Prisma } from "../../src/generated/prisma/client";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type TicketWithLocation = Ticket & { location: Location };

type SendPaymentLinkOptions = {
  ticket: TicketWithLocation;
  tenantId: string;
  amountCents: number;
  message?: string;
  triggeredByUserId?: string | null;
  automated?: boolean;
  metadata?: Record<string, unknown>;
  auditContext?: Record<string, unknown>;
  reason?: string;
};

export async function sendPaymentLinkForTicket({
  ticket,
  tenantId,
  amountCents,
  message,
  triggeredByUserId,
  automated = false,
  metadata,
  auditContext,
  reason = "standard",
}: SendPaymentLinkOptions) {
  if (!hasStripeConfig) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY to enable payment links.");
  }

  if (isSmsSendingDisabled) {
    throw new Error("SMS sending is currently disabled. Set DISABLE_SMS_SENDING=false to enable.");
  }

  if (!hasTwilioConfig) {
    throw new Error("Twilio is not configured. Set TWILIO_SID, TWILIO_AUTH, and TWILIO_FROM_NUMBER.");
  }

  if (!ticket.customerPhone) {
    throw new Error("Ticket does not have a customer phone number");
  }

  if (amountCents <= 0) {
    throw new Error("Calculated amount must be greater than zero");
  }

  const stripe = getStripeClient();
  const description = `Valet ticket ${ticket.ticketNumber} (${ticket.location.name})`;

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: description,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      ticketId: ticket.id,
      tenantId,
      reason,
    },
    after_completion: {
      type: "redirect",
      redirect: {
        url: process.env.PAYMENT_SUCCESS_URL ?? "https://example.com/thanks",
      },
    },
  });

  const payment = await prisma.payment.create({
    data: {
      ticketId: ticket.id,
      tenantId,
      stripeLinkId: paymentLink.id,
      stripeProduct: paymentLink.url,
      amountCents,
      status: "PENDING",
      metadata: {
        ...(metadata ?? {}),
        reason,
      },
    },
  });

  const amountDisplay = (amountCents / 100).toFixed(2);
  const trimmedMessage = message?.trim();
  const messageBody = trimmedMessage
    ? `${trimmedMessage}\nTotal due: $${amountDisplay}\nPay here: ${paymentLink.url}`
    : `ValetPro: Your total is $${amountDisplay}. Pay here: ${paymentLink.url}`;

  const sms = await sendSms({
    to: ticket.customerPhone,
    body: messageBody,
  });

  await prisma.message.create({
    data: {
      tenantId,
      ticketId: ticket.id,
      direction: "OUTBOUND",
      body: messageBody,
      deliveryStatus: "SENT",
      metadata: {
        ...(metadata ?? {}),
        paymentLinkId: paymentLink.id,
        twilioSid: sms.sid,
        amountCents,
        automated,
        reason,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      ticketId: ticket.id,
      userId: triggeredByUserId ?? null,
      action: "PAYMENT_LINK_SENT",
      details: {
        ticketNumber: ticket.ticketNumber,
        amountCents,
        stripePaymentLinkId: paymentLink.id,
        automated,
        reason,
        ...(auditContext ?? {}),
      },
    },
  });

  return { payment, paymentLinkUrl: paymentLink.url, messageBody };
}

const createLinkSchema = z.object({
  ticketId: z.string(),
  message: z.string().max(500).optional(),
});

const refundSchema = z.object({
  paymentId: z.string(),
  amountCents: z.number().int().positive().optional(), // Optional: if not provided, refund full amount
  reason: z.string().max(500).optional(),
});

const listPaymentsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "PAYMENT_LINK_SENT", "COMPLETED", "FAILED", "REFUNDED"])
    .optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
});

export function registerPaymentRoutes(router: Router) {
  router.get("/api/payments", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = listPaymentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }

    const { status, locationId, limit } = parsed.data;

    try {
      const isStaff = session.user.role === UserRole.STAFF;
      const effectiveLocationId =
        isStaff && session.user.locationId
          ? session.user.locationId
          : locationId && locationId !== "all"
            ? locationId
            : undefined;

      const payments = await prisma.payment.findMany({
        where: {
          tenantId: session.tenantId,
          ...(status ? { status } : {}),
          ...(effectiveLocationId
            ? {
                ticket: {
                  locationId: effectiveLocationId,
                },
              }
            : isStaff && session.user.locationId
              ? {
                  ticket: {
                    locationId: session.user.locationId,
                  },
                }
              : {}),
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
        take: limit ?? 50,
      });

      const formatted = payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        refundAmountCents: payment.refundAmountCents ?? 0,
        refundedAt: payment.refundedAt?.toISOString() ?? null,
        stripeRefundId: payment.stripeRefundId ?? null,
        stripeLinkId: payment.stripeLinkId,
        stripeProduct: payment.stripeProduct,
        metadata: payment.metadata ?? null,
        createdAt: payment.createdAt,
        updatedAt: payment.completedAt ?? payment.createdAt,
        ticket: {
          id: payment.ticket.id,
          ticketNumber: payment.ticket.ticketNumber,
          customerName: payment.ticket.customerName,
          customerPhone: payment.ticket.customerPhone,
          location: {
            id: payment.ticket.location.id,
            name: payment.ticket.location.name,
            identifier: payment.ticket.location.identifier,
          },
        },
      }));

      const metrics = formatted.reduce(
        (acc, payment) => {
          acc.totalCount += 1;
          if (payment.status === "COMPLETED") {
            acc.completedCount += 1;
            acc.completedAmountCents += payment.amountCents;
          } else if (payment.status === "REFUNDED") {
            acc.refundedCount += 1;
            acc.refundedAmountCents += payment.refundAmountCents;
          } else {
            acc.pendingCount += 1;
            acc.pendingAmountCents += payment.amountCents;
          }
          // Track refunds separately (even if payment is still COMPLETED with partial refund)
          if (payment.refundAmountCents > 0) {
            acc.totalRefundedAmountCents += payment.refundAmountCents;
          }
          return acc;
        },
        {
          totalCount: 0,
          completedCount: 0,
          pendingCount: 0,
          refundedCount: 0,
          completedAmountCents: 0,
          pendingAmountCents: 0,
          refundedAmountCents: 0,
          totalRefundedAmountCents: 0,
        }
      );

      res.json({
        payments: formatted,
        metrics,
      });
    } catch (error) {
      console.error("Failed to load payments", error);
      res.status(500).json({ error: "Failed to load payments" });
    }
  });

  router.post("/api/payments/create-link", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const { ticketId, message } = parsed.data;

    try {
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId: session.tenantId },
        include: {
          location: true,
        },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (
        session.user.role === "STAFF" &&
        (session.user.locationId == null || ticket.locationId !== session.user.locationId)
      ) {
        res.status(403).json({ error: "You do not have permission to send payments for this ticket" });
        return;
      }

      // Cast pricingTiers to the expected type for calculateProjectedAmountCents
      const ticketForPricing = {
        ...ticket,
        location: {
          ...ticket.location,
          pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      };
      const totalAmountCents = calculateProjectedAmountCents(ticketForPricing);

      const { payment, paymentLinkUrl } = await sendPaymentLinkForTicket({
        ticket,
        tenantId: session.tenantId,
        amountCents: totalAmountCents,
        message,
        triggeredByUserId: session.userId ?? null,
        metadata: { initiatedBy: session.user.id },
        reason: "full_balance",
      });

      res.status(201).json({
        payment,
        paymentLinkUrl,
      });
    } catch (error) {
      console.error("Failed to create payment link", error);
      res.status(500).json({ error: "Failed to create payment link" });
    }
  });

  router.post("/api/payments/refund", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Only admins and managers can refund
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.MANAGER) {
      res.status(403).json({ error: "Only admins and managers can process refunds" });
      return;
    }

    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid refund payload" });
      return;
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
        res.status(404).json({ error: "Payment not found" });
        return;
      }

      if (payment.status !== "COMPLETED") {
        res.status(400).json({ error: "Only completed payments can be refunded" });
        return;
      }

      if (payment.refundAmountCents && payment.refundAmountCents >= payment.amountCents) {
        res.status(400).json({ error: "Payment has already been fully refunded" });
        return;
      }

      const refundAmountCents = amountCents ?? payment.amountCents;
      const alreadyRefunded = payment.refundAmountCents ?? 0;
      const remainingRefundable = payment.amountCents - alreadyRefunded;

      if (refundAmountCents > remainingRefundable) {
        res.status(400).json({
          error: `Cannot refund more than $${(remainingRefundable / 100).toFixed(2)}. $${((alreadyRefunded) / 100).toFixed(2)} has already been refunded.`,
        });
        return;
      }

      if (!hasStripeConfig) {
        res.status(500).json({ error: "Stripe is not configured. Cannot process refund." });
        return;
      }

      const stripe = getStripeClient();

      // Get payment sessions from the payment link to find the payment intent
      let paymentIntentId: string | null = null;
      try {
        const paymentLink = await stripe.paymentLinks.retrieve(payment.stripeLinkId);
        // Payment links don't directly expose payment intents, so we need to search for checkout sessions
        // For now, we'll try to list checkout sessions for this payment link
        // In production, you'd want to store the payment intent ID when the payment is completed via webhook
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
        // If we can't find the payment intent, we can still record the refund in our system
        // but we'll need to handle Stripe refunds manually or via webhook
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
          res.status(500).json({
            error: "Failed to process refund in Stripe. Please try again or contact support.",
          });
          return;
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

      res.json({
        payment: updatedPayment,
        refundAmountCents,
        isFullRefund: isFullyRefunded,
      });
    } catch (error) {
      console.error("Failed to process refund", error);
      res.status(500).json({ error: "Failed to process refund" });
    }
  });
}

