import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { calculateProjectedAmountCents } from "../../../../../server/utils/pricing";
import { sendPaymentLinkForTicket } from "../../../../../server/routes/payments";

const createLinkSchema = z.object({
  ticketId: z.string(),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { ticketId, message } = parsed.data;

  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId: session.tenantId },
      include: {
        location: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (
      session.user.role === "STAFF" &&
      (session.user.locationId == null || ticket.locationId !== session.user.locationId)
    ) {
      return NextResponse.json({ error: "You do not have permission to send payments for this ticket" }, { status: 403 });
    }

    // Cast pricingTiers to the expected type for calculateProjectedAmountCents
    const ticketForPricing = {
      ...ticket,
      location: {
        ...ticket.location,
        pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
      },
    };
    const totalAmountCents = calculateProjectedAmountCents(ticketForPricing);

    const { payment, paymentLinkUrl } = await sendPaymentLinkForTicket({
      ticket,
      tenantId: session.tenantId,
      amountCents: totalAmountCents,
      message,
      triggeredByUserId: session.userId ?? null,
      metadata: { initiatedBy: session.user.id },
      reason: "full_balance",
    });

    return NextResponse.json({
      payment,
      paymentLinkUrl,
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create payment link", error);
    return NextResponse.json({ error: "Failed to create payment link" }, { status: 500 });
  }
}

