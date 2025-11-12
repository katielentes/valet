import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { hasTwilioConfig, sendSms } from "../lib/twilio";

const querySchema = z.object({
  locationId: z.string().optional(),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]).optional(),
});

const updateSchema = z.object({
  customerName: z.string().min(1).max(120).optional(),
  customerPhone: z.string().min(5).max(30).optional(),
  vehicleMake: z.string().min(1).max(80).optional(),
  vehicleModel: z.string().min(1).max(80).optional(),
  vehicleColor: z.string().max(60).nullable().optional(),
  licensePlate: z.string().max(40).nullable().optional(),
  parkingLocation: z.string().max(80).nullable().optional(),
  rateType: z.enum(["HOURLY", "OVERNIGHT"]).optional(),
  inOutPrivileges: z.boolean().optional(),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]).optional(),
  notes: z.string().max(500).nullable().optional(),
  locationId: z.string().optional(),
  checkInTime: z.string().optional(),
});

const createSchema = z.object({
  ticketNumber: z.string().min(1).max(50),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().min(5).max(30),
  vehicleMake: z.string().min(1).max(80),
  vehicleModel: z.string().min(1).max(80),
  vehicleColor: z.string().max(60).nullable().optional(),
  licensePlate: z.string().max(40).nullable().optional(),
  parkingLocation: z.string().max(80).nullable().optional(),
  rateType: z.enum(["HOURLY", "OVERNIGHT"]),
  inOutPrivileges: z.boolean().optional(),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]).optional(),
  locationId: z.string(),
  notes: z.string().max(500).nullable().optional(),
  checkInTime: z.string().optional(),
});
export function registerTicketRoutes(router: Router) {
  router.get("/api/tickets", async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }

    const { locationId, status, vehicleStatus } = parsed.data;

    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userRole = session.user.role;
    const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
    let effectiveLocationId = locationId;
    if (userRole === "STAFF") {
      if (!userLocationId) {
        res.status(403).json({ error: "Location access not configured for this user." });
        return;
      }
      effectiveLocationId = userLocationId;
    }

    try {
      const statusFilter = status
        ? { status }
        : { status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] as const } };

      const tickets = await prisma.ticket.findMany({
        where: {
          tenantId: session.tenantId,
          ...(effectiveLocationId && effectiveLocationId !== "all"
            ? { locationId: effectiveLocationId }
            : {}),
          ...(vehicleStatus ? { vehicleStatus } : {}),
          ...statusFilter,
        },
        include: {
          location: true,
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
          payments: true,
        },
        orderBy: {
          checkInTime: "asc",
        },
      });

      const formatted = tickets.map((ticket) => {
        const projectedAmountCents = calculateProjectedAmountCents(ticket);
        const completedPayments = ticket.payments.filter((payment) => payment.status === "COMPLETED");
        const amountPaidCents = completedPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
        const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);
        const hasCompletedPayment = completedPayments.length > 0;
        const paymentComplete = outstandingAmountCents <= 0;
        const elapsedMs = Math.max(new Date().getTime() - ticket.checkInTime.getTime(), 0);
        const elapsedHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;

        return {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          customerName: ticket.customerName,
          customerPhone: ticket.customerPhone,
          vehicleMake: ticket.vehicleMake,
          vehicleModel: ticket.vehicleModel,
          vehicleColor: ticket.vehicleColor,
          licensePlate: ticket.licensePlate,
          parkingLocation: ticket.parkingLocation,
          rateType: ticket.rateType,
          inOutPrivileges: ticket.inOutPrivileges,
          status: ticket.status,
          vehicleStatus: ticket.vehicleStatus,
          checkInTime: ticket.checkInTime,
          notes: ticket.notes,
          projectedAmountCents,
          elapsedHours,
          amountPaidCents,
          outstandingAmountCents,
          hasCompletedPayment,
          paymentComplete,
          location: {
            id: ticket.location.id,
            name: ticket.location.name,
            identifier: ticket.location.identifier,
          },
          lastMessageAt: ticket.messages[0]?.sentAt ?? null,
        };
      });

      const metrics = formatted.reduce(
        (acc, ticket) => {
          acc.total += 1;
          if (ticket.vehicleStatus === "WITH_US") acc.withUs += 1;
          if (ticket.vehicleStatus === "AWAY") acc.away += 1;
          if (ticket.status === "READY_FOR_PICKUP") acc.ready += 1;
          acc.projectedRevenueCents += ticket.projectedAmountCents;
          return acc;
        },
        {
          total: 0,
          withUs: 0,
          away: 0,
          ready: 0,
          projectedRevenueCents: 0,
        }
      );

      res.json({
        tickets: formatted,
        metrics,
      });
    } catch (error) {
      console.error("Failed to fetch tickets", error);
      res.status(500).json({ error: "Failed to load tickets" });
    }
  });

  router.post("/api/tickets", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid ticket data" });
      return;
    }

    const data = parsed.data;
    const userRole = session.user.role;
    const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
    const locationIdToUse = userRole === "STAFF" ? userLocationId : data.locationId;

    if (!locationIdToUse) {
      res.status(400).json({ error: "Location is required" });
      return;
    }

    try {
      const location = await prisma.location.findFirst({
        where: { id: locationIdToUse, tenantId: session.tenantId },
      });

      if (!location) {
        res.status(400).json({ error: "Invalid location" });
        return;
      }

      const duplicateNumber = await prisma.ticket.findFirst({
        where: {
          tenantId: session.tenantId,
          ticketNumber: data.ticketNumber,
        },
      });

      if (duplicateNumber) {
        res.status(400).json({ error: "Ticket number already exists" });
        return;
      }

      const ticket = await prisma.ticket.create({
        data: {
          tenantId: session.tenantId,
          locationId: locationIdToUse,
          ticketNumber: data.ticketNumber,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          vehicleMake: data.vehicleMake,
          vehicleModel: data.vehicleModel,
          vehicleColor: data.vehicleColor ?? null,
          licensePlate: data.licensePlate ?? null,
          parkingLocation: data.parkingLocation ?? null,
          rateType: data.rateType,
          inOutPrivileges: data.inOutPrivileges ?? false,
          status: data.status ?? "CHECKED_IN",
          vehicleStatus: data.vehicleStatus ?? "WITH_US",
          checkInTime: data.checkInTime ? new Date(data.checkInTime) : undefined,
          notes: data.notes ?? null,
        },
        include: {
          location: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          ticketId: ticket.id,
          userId: session.userId ?? null,
          action: "TICKET_CREATED",
          details: {
            ticketNumber: ticket.ticketNumber,
            message: "Ticket created via API",
          },
        },
      });

      if (hasTwilioConfig && ticket.customerPhone) {
        const valetNumber = process.env.TWILIO_FROM_NUMBER ?? "this number";
        let welcomeMessage = `Hi ${ticket.customerName}, welcome to ValetPro at ${ticket.location.name}. Text ${valetNumber} with your ticket ${ticket.ticketNumber} when you're ready for your vehicle.`;
        if (ticket.inOutPrivileges) {
          welcomeMessage +=
            " Since you have in/out privileges, please let us know if you'll be returning so we can keep your spot ready.";
        }

        try {
          await sendSms({
            to: ticket.customerPhone,
            body: welcomeMessage,
          });

          await prisma.message.create({
            data: {
              tenantId: session.tenantId,
              ticketId: ticket.id,
              direction: "OUTBOUND",
              body: welcomeMessage,
              deliveryStatus: "SENT",
              metadata: {
                automated: true,
                reason: "welcome",
              },
            },
          });

          await prisma.auditLog.create({
            data: {
              tenantId: session.tenantId,
              ticketId: ticket.id,
              userId: session.userId ?? null,
              action: "MESSAGE_SENT",
              details: {
                ticketNumber: ticket.ticketNumber,
                automated: true,
                reason: "welcome",
              },
            },
          });
        } catch (error) {
          console.error("Failed to send welcome message", error);
        }
      }

      res.status(201).json({ ticket });
    } catch (error) {
      console.error("Failed to create ticket", error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  router.patch("/api/tickets/:id", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketId = req.params.id;
    const parsed = updateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid ticket data" });
      return;
    }

    const updates = parsed.data;
    const userRole = session.user.role;
    const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No changes provided" });
      return;
    }

    try {
      const existingTicket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId: session.tenantId },
        include: {
          payments: {
            select: {
              amountCents: true,
              status: true,
            },
          },
          location: true,
        },
      });

      if (!existingTicket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (userRole === "STAFF") {
        if (!userLocationId) {
          res.status(403).json({ error: "Location access not configured for this user." });
          return;
        }
        if (existingTicket.locationId !== userLocationId) {
          res.status(403).json({ error: "You do not have permission to modify this ticket." });
          return;
        }
        if (updates.locationId && updates.locationId !== existingTicket.locationId) {
          res.status(403).json({ error: "You are not allowed to change ticket locations." });
          return;
        }
      }

      if (updates.locationId && updates.locationId !== existingTicket.locationId) {
        const newLocation = await prisma.location.findFirst({
          where: { id: updates.locationId, tenantId: session.tenantId },
        });

        if (!newLocation) {
          res.status(400).json({ error: "Invalid location selection" });
          return;
        }
      }

      const amountPaidCents = existingTicket.payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + payment.amountCents, 0);

      const projectedAmountCents = calculateProjectedAmountCents({
        rateType: existingTicket.rateType,
        checkInTime: existingTicket.checkInTime,
        checkOutTime: existingTicket.checkOutTime ?? null,
        inOutPrivileges: existingTicket.inOutPrivileges,
        location: {
          identifier: existingTicket.location.identifier,
          hourlyRateCents: existingTicket.location.hourlyRateCents,
          overnightRateCents: existingTicket.location.overnightRateCents,
          hourlyTierHours: existingTicket.location.hourlyTierHours,
        },
      });

      const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);

      const statusRequiresPayment =
        updates.status && ["READY_FOR_PICKUP", "COMPLETED"].includes(updates.status);

      if (statusRequiresPayment && outstandingAmountCents > 0) {
        res.status(400).json({
          error: "Payment required before changing status to Ready or Completed.",
        });
        return;
      }

      const vehicleStatusChangingToAway =
        updates.vehicleStatus === "AWAY" && existingTicket.vehicleStatus !== "AWAY";

      if (
        vehicleStatusChangingToAway &&
        existingTicket.inOutPrivileges &&
        outstandingAmountCents > 0
      ) {
        res.status(400).json({
          error: "Outstanding balances must be paid before the vehicle can leave.",
        });
        return;
      }

      const updatedTicket = await prisma.ticket.update({
        where: { id: ticketId },
        data: updates,
        include: {
          location: true,
        },
      });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, value] of Object.entries(updates)) {
        const previous = (existingTicket as Record<string, unknown>)[key];
        if (previous instanceof Date || typeof value === "string" && key === "checkInTime") {
          const previousIso = previous instanceof Date ? previous.toISOString() : previous;
          const nextIso = value instanceof Date ? value.toISOString() : value;
          if (previousIso !== nextIso) {
            changes[key] = { from: previousIso ?? null, to: nextIso ?? null };
          }
        } else if (previous !== value) {
          changes[key] = { from: previous ?? null, to: value ?? null };
        }
      }

      if (Object.keys(changes).length > 0) {
        await prisma.auditLog.create({
          data: {
            tenantId: session.tenantId,
            ticketId,
            userId: session.userId ?? null,
            action: "TICKET_UPDATED",
            details: {
              ticketNumber: existingTicket.ticketNumber,
              changes,
            },
          },
        });
      }

      res.json({ ticket: updatedTicket });
    } catch (error) {
      console.error("Failed to update ticket", error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });
}

