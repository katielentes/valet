import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { UserRole, TicketStatus, VehicleStatus, PaymentStatus } from "../../src/generated/prisma/client";

const generateReportSchema = z.object({
  periodType: z.enum(["WEEKLY", "MONTHLY", "CUSTOM"]),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  locationId: z.string().optional(),
});

export function registerReportRoutes(router: Router) {
  router.post("/api/reports/generate", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = generateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid report parameters" });
      return;
    }

    const { periodType, periodStart, periodEnd, locationId } = parsed.data;

    try {
      const isStaff = session.user.role === UserRole.STAFF;
      const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
      const effectiveLocationId = isStaff ? userLocationId : locationId;

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      if (periodType === "WEEKLY") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (periodType === "MONTHLY") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (periodType === "CUSTOM" && periodStart && periodEnd) {
        startDate = new Date(periodStart);
        endDate = new Date(periodEnd);
      } else {
        res.status(400).json({ error: "Custom period requires start and end dates" });
        return;
      }

      // Fetch payments completed during the report period
      // Use completedAt if available, otherwise fall back to createdAt
      const completedPayments = await prisma.payment.findMany({
        where: {
          tenantId: session.tenantId,
          status: PaymentStatus.COMPLETED,
          ...(effectiveLocationId && effectiveLocationId !== "all"
            ? {
                ticket: {
                  locationId: effectiveLocationId,
                },
              }
            : {}),
          OR: [
            {
              // Payments with completedAt in the period
              completedAt: {
                gte: startDate,
                lte: endDate,
              },
            },
            {
              // Payments without completedAt, but createdAt in the period
              completedAt: null,
              createdAt: {
                gte: startDate,
                lte: endDate,
              },
            },
          ],
        },
        include: {
          ticket: {
            include: {
              location: true,
            },
          },
        },
      });

      // Fetch completed tickets in date range (for ticket count metrics)
      const completedTickets = await prisma.ticket.findMany({
        where: {
          tenantId: session.tenantId,
          ...(effectiveLocationId && effectiveLocationId !== "all"
            ? { locationId: effectiveLocationId }
            : {}),
          status: PaymentStatus.COMPLETED,
          checkInTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          location: true,
          payments: {
            where: { status: "COMPLETED" },
          },
        },
      });

      // Fetch open tickets for projected revenue
      const openTickets = await prisma.ticket.findMany({
        where: {
          tenantId: session.tenantId,
          ...(effectiveLocationId && effectiveLocationId !== "all"
            ? { locationId: effectiveLocationId }
            : {}),
          status: { in: [TicketStatus.CHECKED_IN, TicketStatus.READY_FOR_PICKUP] },
        },
        include: {
          location: true,
          payments: {
            where: { status: "COMPLETED" },
          },
        },
      });

      // Calculate completed revenue from payments completed during the period
      const completedRevenue = completedPayments.reduce((sum, payment) => {
        return sum + payment.amountCents;
      }, 0);

      // Calculate refunded amounts from all payments (including those refunded outside the period)
      // We need to fetch all payments that were refunded during the period
      const refundedPayments = await prisma.payment.findMany({
        where: {
          tenantId: session.tenantId,
          refundAmountCents: { gt: 0 },
          ...(effectiveLocationId && effectiveLocationId !== "all"
            ? {
                ticket: {
                  locationId: effectiveLocationId,
                },
              }
            : {}),
          OR: [
            {
              refundedAt: {
                gte: startDate,
                lte: endDate,
              },
            },
            {
              // If refundedAt is null but refundAmountCents > 0, check if payment was completed in period
              refundedAt: null,
              completedAt: {
                gte: startDate,
                lte: endDate,
              },
              refundAmountCents: { gt: 0 },
            },
          ],
        },
        include: {
          ticket: {
            include: {
              location: true,
            },
          },
        },
      });

      const totalRefunded = refundedPayments.reduce((sum, payment) => {
        return sum + (payment.refundAmountCents ?? 0);
      }, 0);

      // Calculate projected revenue from open tickets
      const projectedRevenue = openTickets.reduce((sum, ticket) => {
        const projected = calculateProjectedAmountCents(ticket);
        const paid = ticket.payments.reduce((pSum, p) => pSum + p.amountCents, 0);
        return sum + Math.max(0, projected - paid);
      }, 0);

      // Group by location
      const locationBreakdown: Record<
        string,
        {
          name: string;
          identifier: string;
          completedRevenue: number;
          projectedRevenue: number;
          completedTickets: number;
          openTickets: number;
          hourlyTickets: number;
          overnightTickets: number;
          hourlyRevenue: number;
          overnightRevenue: number;
          taxRateBasisPoints: number;
          hotelSharePoints: number;
        }
      > = {};

      // Process completed payments for location breakdown
      for (const payment of completedPayments) {
        const locId = payment.ticket.location.id;
        if (!locationBreakdown[locId]) {
          locationBreakdown[locId] = {
            name: payment.ticket.location.name,
            identifier: payment.ticket.location.identifier,
            completedRevenue: 0,
            refundedRevenue: 0,
            projectedRevenue: 0,
            completedTickets: 0,
            openTickets: 0,
            hourlyTickets: 0,
            overnightTickets: 0,
            hourlyRevenue: 0,
            overnightRevenue: 0,
            taxRateBasisPoints: payment.ticket.location.taxRateBasisPoints,
            hotelSharePoints: payment.ticket.location.hotelSharePoints,
          };
        }

        locationBreakdown[locId].completedRevenue += payment.amountCents;

        if (payment.ticket.rateType === "HOURLY") {
          locationBreakdown[locId].hourlyRevenue += payment.amountCents;
        } else {
          locationBreakdown[locId].overnightRevenue += payment.amountCents;
        }
      }

      // Process refunded payments for location breakdown
      for (const payment of refundedPayments) {
        const locId = payment.ticket.location.id;
        if (!locationBreakdown[locId]) {
          locationBreakdown[locId] = {
            name: payment.ticket.location.name,
            identifier: payment.ticket.location.identifier,
            completedRevenue: 0,
            refundedRevenue: 0,
            projectedRevenue: 0,
            completedTickets: 0,
            openTickets: 0,
            hourlyTickets: 0,
            overnightTickets: 0,
            hourlyRevenue: 0,
            overnightRevenue: 0,
            taxRateBasisPoints: payment.ticket.location.taxRateBasisPoints,
            hotelSharePoints: payment.ticket.location.hotelSharePoints,
          };
        }

        locationBreakdown[locId].refundedRevenue += payment.refundAmountCents ?? 0;
      }

      // Process completed tickets for ticket count metrics (not revenue)
      for (const ticket of completedTickets) {
        const locId = ticket.location.id;
        if (!locationBreakdown[locId]) {
          locationBreakdown[locId] = {
            name: ticket.location.name,
            identifier: ticket.location.identifier,
          completedRevenue: 0,
          refundedRevenue: 0,
          projectedRevenue: 0,
            completedTickets: 0,
            openTickets: 0,
            hourlyTickets: 0,
            overnightTickets: 0,
            hourlyRevenue: 0,
            overnightRevenue: 0,
            taxRateBasisPoints: ticket.location.taxRateBasisPoints,
            hotelSharePoints: ticket.location.hotelSharePoints,
          };
        }

        locationBreakdown[locId].completedTickets += 1;

        if (ticket.rateType === "HOURLY") {
          locationBreakdown[locId].hourlyTickets += 1;
        } else {
          locationBreakdown[locId].overnightTickets += 1;
        }
      }

      // Process open tickets
      for (const ticket of openTickets) {
        const locId = ticket.location.id;
        if (!locationBreakdown[locId]) {
          locationBreakdown[locId] = {
            name: ticket.location.name,
            identifier: ticket.location.identifier,
          completedRevenue: 0,
          refundedRevenue: 0,
          projectedRevenue: 0,
            completedTickets: 0,
            openTickets: 0,
            hourlyTickets: 0,
            overnightTickets: 0,
            hourlyRevenue: 0,
            overnightRevenue: 0,
            taxRateBasisPoints: ticket.location.taxRateBasisPoints,
            hotelSharePoints: ticket.location.hotelSharePoints,
          };
        }

        const projected = calculateProjectedAmountCents(ticket);
        const paid = ticket.payments.reduce((sum, p) => sum + p.amountCents, 0);
        const outstanding = Math.max(0, projected - paid);

        locationBreakdown[locId].projectedRevenue += outstanding;
        locationBreakdown[locId].openTickets += 1;

        if (ticket.rateType === "HOURLY") {
          locationBreakdown[locId].hourlyTickets += 1;
        } else {
          locationBreakdown[locId].overnightTickets += 1;
        }
      }

      // Calculate totals
      const totalCompletedTickets = completedTickets.length;
      const totalOpenTickets = openTickets.length;
      const totalHourlyTickets = completedTickets.filter((t) => t.rateType === "HOURLY").length;
      const totalOvernightTickets = completedTickets.filter((t) => t.rateType === "OVERNIGHT").length;

      // Vehicle status breakdown
      const vehicleStatusBreakdown = {
        withUs: openTickets.filter((t) => t.vehicleStatus === VehicleStatus.WITH_US).length,
        away: openTickets.filter((t) => t.vehicleStatus === VehicleStatus.AWAY).length,
      };

      // Calculate taxes and hotel share for completed revenue
      const totalTaxCents = Object.values(locationBreakdown).reduce((sum, loc) => {
        const taxAmount = Math.round((loc.completedRevenue * loc.taxRateBasisPoints) / 10000);
        return sum + taxAmount;
      }, 0);

      const totalHotelShareCents = Object.values(locationBreakdown).reduce((sum, loc) => {
        const shareAmount = Math.round((loc.completedRevenue * loc.hotelSharePoints) / 10000);
        return sum + shareAmount;
      }, 0);

      const netRevenueCents = completedRevenue - totalRefunded - totalTaxCents - totalHotelShareCents;

      const report = {
        periodType,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        locationId: effectiveLocationId ?? null,
        revenue: {
          completed: completedRevenue,
          refunded: totalRefunded,
          projected: projectedRevenue,
          total: completedRevenue + projectedRevenue,
        },
        taxes: {
          total: totalTaxCents,
        },
        hotelShare: {
          total: totalHotelShareCents,
        },
        netRevenue: netRevenueCents,
        tickets: {
          completed: totalCompletedTickets,
          open: totalOpenTickets,
          total: totalCompletedTickets + totalOpenTickets,
          hourly: totalHourlyTickets,
          overnight: totalOvernightTickets,
        },
        vehicleStatus: vehicleStatusBreakdown,
        locationBreakdown: Object.values(locationBreakdown),
      };

      // Optionally save to database
      await prisma.report.create({
        data: {
          tenantId: session.tenantId,
          locationId: effectiveLocationId && effectiveLocationId !== "all" ? effectiveLocationId : null,
          periodType,
          periodStart: startDate,
          periodEnd: endDate,
          data: report,
        },
      });

      res.json({ report });
    } catch (error) {
      console.error("Failed to generate report", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  router.get("/api/reports", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const isStaff = session.user.role === UserRole.STAFF;
      const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
      const effectiveLocationId = isStaff ? userLocationId : undefined;

      const reports = await prisma.report.findMany({
        where: {
          tenantId: session.tenantId,
          ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
        },
        include: {
          location: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      });

      res.json({
        reports: reports.map((r) => ({
          id: r.id,
          periodType: r.periodType,
          periodStart: r.periodStart.toISOString(),
          periodEnd: r.periodEnd.toISOString(),
          location: r.location
            ? {
                id: r.location.id,
                name: r.location.name,
                identifier: r.location.identifier,
              }
            : null,
          data: r.data,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Failed to load reports", error);
      res.status(500).json({ error: "Failed to load reports" });
    }
  });
}

