import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");
  const locationId = searchParams.get("locationId");
  const direction = searchParams.get("direction") as "INBOUND" | "OUTBOUND" | null;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

  console.log("📥 [GET /api/messages] Request received:", {
    ticketId,
    locationId,
    direction,
    limit,
  });

  try {
    const session = await resolveSessionFromRequest(req);
    if (!session) {
      console.log("❌ [GET /api/messages] Unauthorized - no session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("✅ [GET /api/messages] Session resolved:", {
      userId: session.userId,
      tenantId: session.tenantId,
      userRole: session.user.role,
      userLocationId: session.user.locationId,
    });

    const tenantId = session.tenantId;

    // If ticketId is provided, use the existing ticket-scoped logic
    if (ticketId) {
      console.log("🎫 [GET /api/messages] Fetching messages for ticket:", ticketId);

      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId },
        select: { locationId: true },
      });

      if (!ticket) {
        console.log("❌ [GET /api/messages] Ticket not found:", ticketId);
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      if (
        session.user.role === "STAFF" &&
        (session.user.locationId == null || ticket.locationId !== session.user.locationId)
      ) {
        console.log("❌ [GET /api/messages] Permission denied for staff user");
        return NextResponse.json({ error: "You do not have permission to view this ticket's messages." }, { status: 403 });
      }

      const messages = await prisma.message.findMany({
        where: { ticketId, tenantId },
        orderBy: { sentAt: "desc" },
        take: limit ?? 25,
      });

      console.log("✅ [GET /api/messages] Found messages for ticket:", {
        ticketId,
        count: messages.length,
      });

      return NextResponse.json({ messages });
    }

    // Otherwise, return all messages with optional filters
    console.log("📋 [GET /api/messages] Fetching all messages with filters");

    const where: {
      tenantId: string;
      ticketId?: string;
      direction?: "INBOUND" | "OUTBOUND";
      ticket?: { locationId?: string };
    } = {
      tenantId,
    };

    if (direction) {
      where.direction = direction;
    }

    // Only filter by location if it's not "all" and not empty
    if (locationId && locationId !== "all") {
      where.ticket = { locationId };
      console.log("📍 [GET /api/messages] Filtering by location:", locationId);
    }

    // For staff users, restrict to their location
    if (session.user.role === "STAFF" && session.user.locationId) {
      where.ticket = { locationId: session.user.locationId };
      console.log("👤 [GET /api/messages] Staff user - restricting to location:", session.user.locationId);
    }

    console.log("🔍 [GET /api/messages] Query where clause:", JSON.stringify(where, null, 2));

    const messages = await prisma.message.findMany({
      where,
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            customerName: true,
            customerPhone: true,
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { sentAt: "desc" },
      take: limit ?? 50,
    });

    console.log("✅ [GET /api/messages] Found messages:", {
      count: messages.length,
      directions: messages.map((m) => m.direction),
      ticketIds: [...new Set(messages.map((m) => m.ticketId))],
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("❌ [GET /api/messages] Failed to load messages:", error);
    console.error("   Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Unable to load messages" }, { status: 500 });
  }
}

