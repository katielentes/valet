import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { hasTwilioConfig, sendSms } from "../lib/twilio";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { sendPaymentLinkForTicket } from "./payments";

const sendSchema = z.object({
  ticketId: z.string(),
  body: z.string().min(1).max(500),
});

const REQUEST_KEYWORDS = ["ready", "pickup", "pick up", "car", "retrieve", "bring"];
const YES_KEYWORDS = ["yes", "y", "yeah", "yep", "return", "returning", "back"];
const NO_KEYWORDS = ["no", "n", "nope", "not", "never"];

function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (phone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

async function recordOutboundMessage({
  tenantId,
  ticketId,
  body,
  automated = false,
  metadata,
}: {
  tenantId: string;
  ticketId: string;
  body: string;
  automated?: boolean;
  metadata?: Record<string, unknown>;
}) {
  await prisma.message.create({
    data: {
      tenantId,
      ticketId,
      direction: "OUTBOUND",
      body,
      deliveryStatus: "SENT",
      metadata: {
        automated,
        ...(metadata ?? {}),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      ticketId,
      userId: null,
      action: "MESSAGE_SENT",
      details: {
        direction: "OUTBOUND",
        automated,
      },
    },
  });
}

const templateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  body: z.string().min(1, "Body is required").max(500, "Body must be 500 characters or less"),
});

export function registerMessageRoutes(router: Router) {
  router.get("/api/messages/templates", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const tenantId = session.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Missing tenant context" });
        return;
      }

      const templates = await prisma.messageTemplate.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
      });

      res.json({ templates });
    } catch (error) {
      console.error("Failed to load message templates", error);
      res.status(500).json({ error: "Unable to load templates" });
    }
  });

  router.post("/api/messages/templates", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (session.user.role === "STAFF") {
        res.status(403).json({ error: "Staff users cannot create templates" });
        return;
      }

      const tenantId = session.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Missing tenant context" });
        return;
      }

      const parsed = templateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid template data", details: parsed.error.errors });
        return;
      }

      const { name, body } = parsed.data;

      const template = await prisma.messageTemplate.create({
        data: {
          tenantId,
          name,
          body,
        },
      });

      res.status(201).json({ template });
    } catch (error) {
      console.error("Failed to create template", error);
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        res.status(409).json({ error: "A template with this name already exists" });
        return;
      }
      res.status(500).json({ error: "Unable to create template" });
    }
  });

  router.patch("/api/messages/templates/:id", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (session.user.role === "STAFF") {
        res.status(403).json({ error: "Staff users cannot edit templates" });
        return;
      }

      const tenantId = session.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Missing tenant context" });
        return;
      }

      const templateId = req.params.id;
      const parsed = templateSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid template data", details: parsed.error.errors });
        return;
      }

      const existing = await prisma.messageTemplate.findFirst({
        where: { id: templateId, tenantId },
      });

      if (!existing) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      const template = await prisma.messageTemplate.update({
        where: { id: templateId },
        data: parsed.data,
      });

      res.json({ template });
    } catch (error) {
      console.error("Failed to update template", error);
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        res.status(409).json({ error: "A template with this name already exists" });
        return;
      }
      res.status(500).json({ error: "Unable to update template" });
    }
  });

  router.delete("/api/messages/templates/:id", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (session.user.role === "STAFF") {
        res.status(403).json({ error: "Staff users cannot delete templates" });
        return;
      }

      const tenantId = session.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Missing tenant context" });
        return;
      }

      const templateId = req.params.id;

      const existing = await prisma.messageTemplate.findFirst({
        where: { id: templateId, tenantId },
      });

      if (!existing) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      await prisma.messageTemplate.delete({
        where: { id: templateId },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete template", error);
      res.status(500).json({ error: "Unable to delete template" });
    }
  });

  router.get("/api/messages", async (req, res) => {
    const ticketId = req.query.ticketId?.toString();
    const locationId = req.query.locationId?.toString();
    const direction = req.query.direction?.toString() as "INBOUND" | "OUTBOUND" | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit.toString()) : undefined;

    try {
      const session = await resolveSession(req);
      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const tenantId = session.tenantId;

      // If ticketId is provided, use the existing ticket-scoped logic
      if (ticketId) {
        const ticket = await prisma.ticket.findFirst({
          where: { id: ticketId, tenantId },
          select: { locationId: true },
        });

        if (!ticket) {
          res.status(404).json({ error: "Ticket not found" });
          return;
        }

        if (
          session.user.role === "STAFF" &&
          (session.user.locationId == null || ticket.locationId !== session.user.locationId)
        ) {
          res.status(403).json({ error: "You do not have permission to view this ticket's messages." });
          return;
        }

        const messages = await prisma.message.findMany({
          where: { ticketId, tenantId },
          orderBy: { sentAt: "desc" },
          take: limit ?? 25,
        });

        res.json({ messages });
        return;
      }

      // Otherwise, return all messages with optional filters
      const where: {
        tenantId: string;
        ticketId?: string;
        direction?: "INBOUND" | "OUTBOUND";
        ticket?: { locationId?: string };
      } = {
        tenantId,
      };

      if (direction) {
        where.direction = direction;
      }

      if (locationId) {
        where.ticket = { locationId };
      }

      // For staff users, restrict to their location
      if (session.user.role === "STAFF" && session.user.locationId) {
        where.ticket = { locationId: session.user.locationId };
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              customerName: true,
              customerPhone: true,
              location: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { sentAt: "desc" },
        take: limit ?? 50,
      });

      res.json({ messages });
    } catch (error) {
      console.error("Failed to load messages", error);
      res.status(500).json({ error: "Unable to load messages" });
    }
  });

  router.post("/api/messages/send", async (req, res) => {
    if (!hasTwilioConfig) {
      res.status(500).json({
        error:
          "Twilio is not configured. Set TWILIO_SID and TWILIO_AUTH, plus TWILIO_FROM_NUMBER when you are ready to send.",
      });
      return;
    }

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid message payload" });
      return;
    }

    const { ticketId, body } = parsed.data;

    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { tenant: true },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.tenantId !== session.tenantId) {
        res.status(403).json({ error: "Ticket does not belong to your tenant" });
        return;
      }

      if (session.user.role === "STAFF") {
        if (!session.user.locationId) {
          res.status(403).json({ error: "Location access not configured for this user." });
          return;
        }
        if (ticket.locationId !== session.user.locationId) {
          res.status(403).json({ error: "You do not have permission to message this ticket." });
          return;
        }
      }

      if (!ticket.customerPhone) {
        res.status(400).json({ error: "Ticket does not have a customer phone number" });
        return;
      }

      const tenantId = session.tenantId;

      await sendSms({
        to: ticket.customerPhone,
        body,
      });

      const message = await prisma.message.create({
        data: {
          tenantId,
          ticketId,
          direction: "OUTBOUND",
          body,
          deliveryStatus: "SENT",
          metadata: {
            sentByUserId: session.userId,
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          ticketId,
          userId: session.userId ?? null,
          action: "MESSAGE_SENT",
          details: {
            ticketNumber: ticket.ticketNumber,
            sentBy: session.user.email,
            automated: false,
          },
        },
      });

      res.json({ message });
    } catch (error) {
      console.error("Failed to send message", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  router.post("/api/messages/inbound", async (req, res) => {
    const bodyRaw = typeof req.body?.Body === "string" ? req.body.Body : "";
    const fromRaw = typeof req.body?.From === "string" ? req.body.From : "";
    const toRaw = typeof req.body?.To === "string" ? req.body.To : "";

    if (!fromRaw) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    const normalizedFrom = normalizePhoneNumber(fromRaw);
    const digitsOnly = normalizedFrom.replace(/^\+/, "");
    const localDigits = digitsOnly.length === 11 && digitsOnly.startsWith("1") ? digitsOnly.slice(1) : digitsOnly;
    const possiblePhones = Array.from(
      new Set(
        [fromRaw.trim(), normalizedFrom, digitsOnly ? `+${digitsOnly}` : "", localDigits].filter(
          (value) => Boolean(value)
        )
      )
    );

    try {
      const ticket = await prisma.ticket.findFirst({
        where: {
          status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
          customerPhone: { in: possiblePhones },
        },
        include: {
          location: true,
          payments: {
            select: {
              amountCents: true,
              status: true,
            },
          },
        },
        orderBy: {
          checkInTime: "desc",
        },
      });

      if (!ticket) {
        res.type("text/xml").send("<Response></Response>");
        return;
      }

      const trimmedBody = bodyRaw.trim();
      const normalizedBody = trimmedBody.toLowerCase();

      await prisma.message.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          direction: "INBOUND",
          body: trimmedBody,
          deliveryStatus: "RECEIVED",
          metadata: {
            from: normalizedFrom,
            rawFrom: fromRaw,
            to: toRaw,
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          userId: null,
          action: "MESSAGE_SENT",
          details: {
            direction: "INBOUND",
            bodyPreview: trimmedBody.slice(0, 120),
            from: normalizedFrom,
          },
        },
      });

      const amountPaidCents = ticket.payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + payment.amountCents, 0);

      const projectedAmountCents = calculateProjectedAmountCents(ticket);
      const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);

      const isPickupRequest = REQUEST_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));

      if (isPickupRequest) {
        if (
          ticket.rateType === "HOURLY" &&
          amountPaidCents > 0 &&
          outstandingAmountCents > 0 &&
          hasTwilioConfig
        ) {
          await sendPaymentLinkForTicket({
            ticket,
            tenantId: ticket.tenantId,
            amountCents: outstandingAmountCents,
            message: `Thanks ${ticket.customerName}! It looks like there's an additional balance of $${(
              outstandingAmountCents / 100
            ).toFixed(2)} on ticket ${ticket.ticketNumber}. Please complete the payment below so we can bring your vehicle around.`,
            automated: true,
            metadata: { initiatedBy: "auto_difference" },
            auditContext: {
              requestSource: "customer_request",
              outstandingAmountCents,
            },
            reason: "outstanding_balance",
          });
        } else if (hasTwilioConfig) {
          let acknowledgement = `Thanks ${ticket.customerName}! We've received your request for ticket ${ticket.ticketNumber}. We'll let you know as soon as your vehicle is ready.`;
          if (ticket.inOutPrivileges) {
            acknowledgement +=
              " Will you be returning your car to valet later today? Reply YES if you're coming back or NO if not.";
          }

          await sendSms({
            to: ticket.customerPhone,
            body: acknowledgement,
          });

          await recordOutboundMessage({
            tenantId: ticket.tenantId,
            ticketId: ticket.id,
            body: acknowledgement,
            automated: true,
            metadata: { reason: "pickup_acknowledgement" },
          });
        }
      } else if (ticket.inOutPrivileges) {
        if (YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword))) {
          await prisma.auditLog.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              userId: null,
              action: "MESSAGE_SENT",
              details: {
                direction: "INBOUND",
                message: "Customer plans to return vehicle.",
              },
            },
          });
        } else if (NO_KEYWORDS.some((keyword) => normalizedBody.includes(keyword))) {
          await prisma.auditLog.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              userId: null,
              action: "MESSAGE_SENT",
              details: {
                direction: "INBOUND",
                message: "Customer does not plan to return vehicle.",
              },
            },
          });
        }
      }

      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      console.error("Failed to process inbound message", error);
      res.type("text/xml").send("<Response></Response>");
    }
  });
}

