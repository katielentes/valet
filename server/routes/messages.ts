import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { hasTwilioConfig, sendSms } from "../lib/twilio";

const sendSchema = z.object({
  ticketId: z.string(),
  body: z.string().min(1).max(500),
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

  router.get("/api/messages", async (req, res) => {
    const ticketId = req.query.ticketId?.toString();

    if (!ticketId) {
      res.status(400).json({ error: "ticketId query parameter is required" });
      return;
    }

    try {
      const session = await resolveSession(req);
      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const messages = await prisma.message.findMany({
        where: { ticketId, tenantId: session.tenantId },
        orderBy: { sentAt: "desc" },
        take: 25,
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

      if (!ticket.customerPhone) {
        res.status(400).json({ error: "Ticket does not have a customer phone number" });
        return;
      }

      const tenantId = session.tenantId;

      // Send via Twilio
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
        },
      });

      res.json({ message });
    } catch (error) {
      console.error("Failed to send message", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
}

