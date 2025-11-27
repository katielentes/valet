import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "../../../../server/lib/prisma";
import { TicketStatus } from "../../../../src/generated/prisma/client";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { calculateProjectedAmountCents } from "../../../../server/utils/pricing";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../../../../server/lib/twilio";
import { hasStripeConfig } from "../../../../server/lib/stripe";

const querySchema = z.object({
  locationId: z.string().optional(),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]).optional(),
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
  durationDays: z.number().int().positive().nullable().optional(),
  durationHours: z.number().int().positive().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = {
    locationId: searchParams.get("locationId") || undefined,
    status: searchParams.get("status") || undefined,
    vehicleStatus: searchParams.get("vehicleStatus") || undefined,
  };

  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    console.error("Ticket query validation error:", parsed.error.issues);
    return NextResponse.json({ 
      error: "Invalid query parameters",
      details: parsed.error.issues 
    }, { status: 400 });
  }

  const { locationId, status, vehicleStatus } = parsed.data;

  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
  let effectiveLocationId = locationId;
  if (userRole === "STAFF") {
    if (!userLocationId) {
      return NextResponse.json({ error: "Location access not configured for this user." }, { status: 403 });
    }
    effectiveLocationId = userLocationId;
  }

  try {
    const statusFilter = status
      ? { status }
      : { status: { in: [TicketStatus.CHECKED_IN, TicketStatus.READY_FOR_PICKUP] } };

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
      const ticketForPricing = {
        ...ticket,
        location: {
          ...ticket.location,
          pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      };
      const projectedAmountCents = calculateProjectedAmountCents(ticketForPricing);
      const completedPayments = ticket.payments.filter((payment) => payment.status === "COMPLETED");
      const amountPaidCents = completedPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
      const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);
      const hasCompletedPayment = completedPayments.length > 0;
      const paymentComplete = outstandingAmountCents <= 0;
      const checkInTime = ticket.checkInTime instanceof Date ? ticket.checkInTime : new Date(ticket.checkInTime);
      const elapsedMs = Math.max(new Date().getTime() - checkInTime.getTime(), 0);
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
        durationDays: ticket.durationDays,
        durationHours: ticket.durationHours,
        willReturn: ticket.willReturn,
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
          overnightInOutPrivileges: ticket.location.overnightInOutPrivileges,
          pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
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

    return NextResponse.json({
      tickets: formatted,
      metrics,
    });
  } catch (error) {
    console.error("Failed to fetch tickets", error);
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Ticket creation validation error:", parsed.error.errors);
    return NextResponse.json({ 
      error: "Invalid ticket data",
      details: parsed.error.errors 
    }, { status: 400 });
  }

  const data = parsed.data;
  const userRole = session.user.role;
  const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
  const locationIdToUse = userRole === "STAFF" ? userLocationId : data.locationId;

  if (!locationIdToUse) {
    return NextResponse.json({ error: "Location is required" }, { status: 400 });
  }

  try {
    const location = await prisma.location.findFirst({
      where: { id: locationIdToUse, tenantId: session.tenantId },
    });

    if (!location) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const duplicateNumber = await prisma.ticket.findFirst({
      where: {
        tenantId: session.tenantId,
        locationId: locationIdToUse,
        ticketNumber: data.ticketNumber,
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
    });

    if (duplicateNumber) {
      return NextResponse.json({ error: `Ticket number ${data.ticketNumber} is already in use at this location` }, { status: 400 });
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
        durationDays: data.durationDays ?? null,
        durationHours: data.durationHours ?? null,
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

    // Send payment link immediately when ticket is created
    if (hasTwilioConfig && !isSmsSendingDisabled && ticket.customerPhone) {
      try {
        const ticketForPricing = {
          ...ticket,
          location: {
            ...ticket.location,
            pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
          },
        };
        const totalAmountCents = calculateProjectedAmountCents(ticketForPricing);
        
        if (totalAmountCents > 0 && hasStripeConfig) {
          console.log("💳 [TICKET CREATE] Sending payment link immediately for new ticket");
          const { sendPaymentLinkForTicket } = await import("../../../../server/routes/payments");
          
          await sendPaymentLinkForTicket({
            ticket,
            tenantId: session.tenantId,
            amountCents: totalAmountCents,
            message: `Thanks for using ValetPro at ${ticket.location.name}! To request your car, pay here:`,
            automated: true,
            triggeredByUserId: session.userId ?? null,
            metadata: { initiatedBy: "ticket_creation" },
            reason: "initial_payment",
          });
          
          console.log("✅ [TICKET CREATE] Payment link sent with welcome message");
        } else {
          const valetNumber = process.env.TWILIO_FROM_NUMBER ?? "this number";
          let welcomeMessage = `Hi ${ticket.customerName}, welcome to ValetPro at ${ticket.location.name}. Text ${valetNumber} with your ticket ${ticket.ticketNumber} when you're ready for your vehicle.`;
          if (ticket.inOutPrivileges) {
            welcomeMessage +=
              " Since you have in/out privileges, please let us know if you'll be returning so we can keep your spot ready.";
          }

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
        }
      } catch (error) {
        console.error("Failed to send welcome message/payment link", error);
      }
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("Failed to create ticket", error);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}

