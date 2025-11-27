import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole, TicketStatus, VehicleStatus, PaymentStatus } from "../../../../../src/generated/prisma/client";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { calculateProjectedAmountCents } from "../../../../../server/utils/pricing";

const generateReportSchema = z.object({
  periodType: z.enum(["WEEKLY", "MONTHLY", "CUSTOM"]),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  locationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = generateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report parameters" }, { status: 400 });
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
      return NextResponse.json({ error: "Custom period requires start and end dates" }, { status: 400 });
    }

    // Fetch payments completed during the report period
    const completedPayments = await prisma.payment.findMany({
      where: {
        tenantId: session.tenantId,
        status: TicketStatus.COMPLETED,
        ...(effectiveLocationId && effectiveLocationId !== "all"
          ? {
              ticket: {
                locationId: effectiveLocationId,
              },
            }
          : {}),
        OR: [
          {
            completedAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
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

    // Fetch completed tickets in date range
    const completedTickets = await prisma.ticket.findMany({
      where: {
        tenantId: session.tenantId,
        ...(effectiveLocationId && effectiveLocationId !== "all"
          ? { locationId: effectiveLocationId }
          : {}),
        status: TicketStatus.COMPLETED,
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

    // Calculate completed revenue
    const completedRevenue = completedPayments.reduce((sum, payment) => {
      return sum + payment.amountCents;
    }, 0);

    // Calculate refunded amounts
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
      const ticketForPricing = {
        ...ticket,
        location: {
          ...ticket.location,
          pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      };
      const projected = calculateProjectedAmountCents(ticketForPricing);
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
        refundedRevenue: number;
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

    // Process completed tickets for ticket count metrics
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

      const ticketForPricing = {
        ...ticket,
        location: {
          ...ticket.location,
          pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      };
      const projected = calculateProjectedAmountCents(ticketForPricing);
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

    // Calculate taxes and hotel share
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

    // Save to database
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

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Failed to generate report", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

