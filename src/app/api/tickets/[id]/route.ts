import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "../../../../../src/generated/prisma/client";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { calculateProjectedAmountCents } from "../../../../../server/utils/pricing";

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
  durationDays: z.number().int().positive().nullable().optional(),
  durationHours: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    console.error("Ticket update validation error:", parsed.error.issues);
    return NextResponse.json({ 
      error: "Invalid ticket data",
      details: parsed.error.issues 
    }, { status: 400 });
  }

  const updates = parsed.data;
  const userRole = session.user.role;
  const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
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
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (userRole === "STAFF") {
      if (!userLocationId) {
        return NextResponse.json({ error: "Location access not configured for this user." }, { status: 403 });
      }
      if (existingTicket.locationId !== userLocationId) {
        return NextResponse.json({ error: "You do not have permission to modify this ticket." }, { status: 403 });
      }
      if (updates.locationId && updates.locationId !== existingTicket.locationId) {
        return NextResponse.json({ error: "You are not allowed to change ticket locations." }, { status: 403 });
      }
    }

    if (updates.locationId && updates.locationId !== existingTicket.locationId) {
      const newLocation = await prisma.location.findFirst({
        where: { id: updates.locationId, tenantId: session.tenantId },
      });

      if (!newLocation) {
        return NextResponse.json({ error: "Invalid location selection" }, { status: 400 });
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
        overnightRateCents: existingTicket.location.overnightRateCents,
        pricingTiers: (existingTicket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
      },
    });

    const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);

    const statusRequiresPayment =
      updates.status && ["READY_FOR_PICKUP", "COMPLETED"].includes(updates.status);

    if (statusRequiresPayment && outstandingAmountCents > 0) {
      return NextResponse.json({
        error: "Payment required before changing status to Ready or Completed.",
      }, { status: 400 });
    }

    const vehicleStatusChangingToAway =
      updates.vehicleStatus === "AWAY" && existingTicket.vehicleStatus !== "AWAY";

    if (
      vehicleStatusChangingToAway &&
      existingTicket.inOutPrivileges &&
      outstandingAmountCents > 0
    ) {
      return NextResponse.json({
        error: "Outstanding balances must be paid before the vehicle can leave.",
      }, { status: 400 });
    }

    // If vehicle is being marked as AWAY and ticket is READY_FOR_PICKUP, change status back to CHECKED_IN
    if (vehicleStatusChangingToAway && existingTicket.status === "READY_FOR_PICKUP") {
      updates.status = "CHECKED_IN";
      console.log(`🔄 [TICKET UPDATE] Ticket ${existingTicket.ticketNumber} status changed from READY_FOR_PICKUP to CHECKED_IN because vehicle is now AWAY`);
    }

    // Convert checkInTime string to Date if provided
    const updateData = {
      ...updates,
      ...(updates.checkInTime ? { checkInTime: new Date(updates.checkInTime) } : {}),
    };

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        location: true,
      },
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(updates)) {
      const previous = (existingTicket as Record<string, unknown>)[key];
      if (key === "checkInTime") {
        const previousIso = previous instanceof Date ? previous.toISOString() : String(previous ?? "");
        const nextIso = String(value ?? "");
        if (previousIso !== nextIso) {
          changes[key] = { from: previousIso || null, to: nextIso || null };
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
          } as Prisma.InputJsonValue,
        },
      });
    }

    return NextResponse.json({ ticket: updatedTicket });
  } catch (error) {
    console.error("Failed to update ticket", error);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only ADMIN and MANAGER roles can delete tickets
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return NextResponse.json({ error: "Only admins and managers can delete tickets" }, { status: 403 });
  }

  const { id: ticketId } = await params;

  try {
    const existingTicket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId: session.tenantId },
      include: {
        messages: true,
        payments: true,
        comments: true,
        auditLogs: true,
      },
    });

    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Create audit log for deletion BEFORE deleting the ticket
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        ticketId: ticketId,
        userId: session.userId ?? null,
        action: "TICKET_DELETED",
        details: {
          ticketNumber: existingTicket.ticketNumber,
          deletedBy: session.user.name,
          deletedByRole: session.user.role,
          message: `Ticket ${existingTicket.ticketNumber} was permanently deleted`,
        },
      },
    });

    // Delete the ticket (cascade deletes will handle related records)
    await prisma.ticket.delete({
      where: { id: ticketId },
    });

    return NextResponse.json({ message: "Ticket deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete ticket", error);
    return NextResponse.json({ error: "Failed to delete ticket" }, { status: 500 });
  }
}

