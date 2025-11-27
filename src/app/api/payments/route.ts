import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "../../../../src/generated/prisma/client";
import prisma from "../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

const listPaymentsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "PAYMENT_LINK_SENT", "COMPLETED", "FAILED", "REFUNDED"])
    .optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = {
    status: searchParams.get("status") || undefined,
    locationId: searchParams.get("locationId") || undefined,
    limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined,
  };

  const parsed = listPaymentsQuerySchema.safeParse(query);
  if (!parsed.success) {
    console.error("Payment query validation error:", parsed.error.issues);
    return NextResponse.json({ 
      error: "Invalid query parameters",
      details: parsed.error.issues 
    }, { status: 400 });
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
      refundAmountCents: payment.refundAmountCents ?? 0,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      stripeRefundId: payment.stripeRefundId ?? null,
      stripeLinkId: payment.stripeLinkId,
      stripeProduct: payment.stripeProduct,
      metadata: payment.metadata ?? null,
      createdAt: payment.createdAt,
      updatedAt: payment.completedAt ?? payment.createdAt,
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
        } else if (payment.status === "REFUNDED") {
          acc.refundedCount += 1;
          acc.refundedAmountCents += payment.refundAmountCents;
        } else {
          acc.pendingCount += 1;
          acc.pendingAmountCents += payment.amountCents;
        }
        if (payment.refundAmountCents > 0) {
          acc.totalRefundedAmountCents += payment.refundAmountCents;
        }
        return acc;
      },
      {
        totalCount: 0,
        completedCount: 0,
        pendingCount: 0,
        refundedCount: 0,
        completedAmountCents: 0,
        pendingAmountCents: 0,
        refundedAmountCents: 0,
        totalRefundedAmountCents: 0,
      }
    );

    return NextResponse.json({
      payments: formatted,
      metrics,
    });
  } catch (error) {
    console.error("Failed to load payments", error);
    return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
  }
}

