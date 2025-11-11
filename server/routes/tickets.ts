import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";

const querySchema = z.object({
  locationId: z.string().optional(),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]).optional(),
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
}

