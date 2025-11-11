import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";

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
});

function calculateProjectedAmount(ticket: {
  rateType: "HOURLY" | "OVERNIGHT";
  checkInTime: Date;
  checkOutTime: Date | null;
  location: {
    hourlyRateCents: number;
    overnightRateCents: number;
    hourlyTierHours: number | null;
  };
}) {
  if (ticket.rateType === "OVERNIGHT") {
    return ticket.location.overnightRateCents;
  }

  const endTime = ticket.checkOutTime ?? new Date();
  const diffMs = Math.max(endTime.getTime() - ticket.checkInTime.getTime(), 0);
  const diffHours = diffMs / (1000 * 60 * 60);

  const billedHours = Math.max(1, Math.ceil(diffHours));
  const tier = ticket.location.hourlyTierHours ?? 0;

  if (tier && diffHours > tier) {
    return ticket.location.overnightRateCents;
  }

  return ticket.location.hourlyRateCents * billedHours;
}

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

    try {
      const statusFilter = status
        ? { status }
        : { status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] as const } };

      const tickets = await prisma.ticket.findMany({
        where: {
          tenantId: session.tenantId,
          ...(locationId && locationId !== "all" ? { locationId } : {}),
          ...(vehicleStatus ? { vehicleStatus } : {}),
          ...statusFilter,
        },
        include: {
          location: true,
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
        orderBy: {
          checkInTime: "asc",
        },
      });

      const formatted = tickets.map((ticket) => {
        const projectedAmountCents = calculateProjectedAmount(ticket);
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

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No changes provided" });
      return;
    }

    try {
      const existingTicket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId: session.tenantId },
      });

      if (!existingTicket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
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

      const updatedTicket = await prisma.ticket.update({
        where: { id: ticketId },
        data: updates,
      });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, value] of Object.entries(updates)) {
        const previous = (existingTicket as Record<string, unknown>)[key];
        if (previous !== value) {
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

