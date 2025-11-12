import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { hasStripeConfig, getStripeClient } from "../lib/stripe";
import { hasTwilioConfig, sendSms } from "../lib/twilio";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { Ticket, Location, UserRole } from "../../src/generated/prisma/client";

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
      redirect_url: process.env.PAYMENT_SUCCESS_URL ?? "https://example.com/thanks",
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
        stripeLinkId: payment.stripeLinkId,
        stripeProduct: payment.stripeProduct,
        metadata: payment.metadata ?? null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
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
          } else {
            acc.pendingCount += 1;
            acc.pendingAmountCents += payment.amountCents;
          }
          return acc;
        },
        {
          totalCount: 0,
          completedCount: 0,
          pendingCount: 0,
          completedAmountCents: 0,
          pendingAmountCents: 0,
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

      const totalAmountCents = calculateProjectedAmountCents(ticket);

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
}

