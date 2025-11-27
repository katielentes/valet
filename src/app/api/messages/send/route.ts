import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../../../../../server/lib/twilio";

const sendSchema = z.object({
  ticketId: z.string(),
  body: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  if (!hasTwilioConfig) {
    return NextResponse.json({
      error:
        "Twilio is not configured. Set TWILIO_SID and TWILIO_AUTH, plus TWILIO_FROM_NUMBER when you are ready to send.",
    }, { status: 500 });
  }

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message payload" }, { status: 400 });
  }

  const { ticketId, body: messageBody } = parsed.data;

  try {
    const session = await resolveSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { tenant: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Ticket does not belong to your tenant" }, { status: 403 });
    }

    if (session.user.role === "STAFF") {
      if (!session.user.locationId) {
        return NextResponse.json({ error: "Location access not configured for this user." }, { status: 403 });
      }
      if (ticket.locationId !== session.user.locationId) {
        return NextResponse.json({ error: "You do not have permission to message this ticket." }, { status: 403 });
      }
    }

    if (!ticket.customerPhone) {
      return NextResponse.json({ error: "Ticket does not have a customer phone number" }, { status: 400 });
    }

    const tenantId = session.tenantId;

    await sendSms({
      to: ticket.customerPhone,
      body: messageBody,
    });

    const message = await prisma.message.create({
      data: {
        tenantId,
        ticketId,
        direction: "OUTBOUND",
        body: messageBody,
        deliveryStatus: "SENT",
        metadata: {
          sentByUserId: session.userId,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        ticketId,
        userId: session.userId ?? null,
        action: "MESSAGE_SENT",
        details: {
          ticketNumber: ticket.ticketNumber,
          sentBy: session.user.email,
          automated: false,
        },
      },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Failed to send message", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

