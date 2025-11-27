import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../lib/twilio";
import { calculateProjectedAmountCents } from "../utils/pricing";
import { sendPaymentLinkForTicket } from "./payments";

const sendSchema = z.object({
  ticketId: z.string(),
  body: z.string().min(1).max(500),
});

const REQUEST_KEYWORDS = ["ready", "pickup", "pick up", "car", "retrieve", "bring"];
const YES_KEYWORDS = ["yes", "y", "yeah", "yep", "return", "returning", "back"];
const NO_KEYWORDS = ["no", "n", "nope", "not", "never"];

function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (phone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

function generatePhoneVariations(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  
  const variations = new Set<string>();
  
  // Add original
  variations.add(phone.trim());
  
  // Add normalized version
  const normalized = normalizePhoneNumber(phone);
  variations.add(normalized);
  
  // Add digits only
  variations.add(digits);
  
  // If it starts with +1, add without +
  if (normalized.startsWith("+1") && normalized.length === 12) {
    variations.add(normalized.slice(1)); // Remove +
    variations.add(normalized.slice(2)); // Remove +1
  }
  
  // If it's 11 digits starting with 1, add 10-digit version
  if (digits.length === 11 && digits.startsWith("1")) {
    variations.add(digits.slice(1));
    variations.add(`+${digits}`);
    variations.add(`+1${digits.slice(1)}`);
  }
  
  // If it's 10 digits, add with +1 and +1 prefix
  if (digits.length === 10) {
    variations.add(`+1${digits}`);
    variations.add(`1${digits}`);
    variations.add(digits);
  }
  
  // Add formatted versions (common formats)
  if (digits.length === 10) {
    variations.add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
    variations.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  }
  
  return Array.from(variations).filter(v => v.length > 0);
}

async function recordOutboundMessage({
  tenantId,
  ticketId,
  body,
  automated = false,
  metadata,
}: {
  tenantId: string;
  ticketId: string;
  body: string;
  automated?: boolean;
  metadata?: Record<string, unknown>;
}) {
  await prisma.message.create({
    data: {
      tenantId,
      ticketId,
      direction: "OUTBOUND",
      body,
      deliveryStatus: "SENT",
      metadata: {
        automated,
        ...(metadata ?? {}),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      ticketId,
      userId: null,
      action: "MESSAGE_SENT",
      details: {
        direction: "OUTBOUND",
        automated,
      },
    },
  });
}

export function registerMessageRoutes(router: Router) {
  router.get("/api/messages/templates", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const tenantId = session.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Missing tenant context" });
        return;
      }

      const templates = await prisma.messageTemplate.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
      });

      res.json({ templates });
    } catch (error) {
      console.error("Failed to load message templates", error);
      res.status(500).json({ error: "Unable to load templates" });
    }
  });

  router.get("/api/messages", async (req, res) => {
    const ticketId = req.query.ticketId?.toString();
    const locationId = req.query.locationId?.toString();
    const direction = req.query.direction?.toString() as "INBOUND" | "OUTBOUND" | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit.toString()) : undefined;

    console.log("📥 [GET /api/messages] Request received:", {
      ticketId,
      locationId,
      direction,
      limit,
      query: req.query,
    });

    try {
      const session = await resolveSession(req);
      if (!session) {
        console.log("❌ [GET /api/messages] Unauthorized - no session");
        res.status(401).json({ error: "Unauthorized" });
        return;
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
          res.status(404).json({ error: "Ticket not found" });
          return;
        }

        if (
          session.user.role === "STAFF" &&
          (session.user.locationId == null || ticket.locationId !== session.user.locationId)
        ) {
          console.log("❌ [GET /api/messages] Permission denied for staff user");
          res.status(403).json({ error: "You do not have permission to view this ticket's messages." });
          return;
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

        res.json({ messages });
        return;
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

      res.json({ messages });
    } catch (error) {
      console.error("❌ [GET /api/messages] Failed to load messages:", error);
      console.error("   Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ error: "Unable to load messages" });
    }
  });

  router.post("/api/messages/send", async (req, res) => {
    if (!hasTwilioConfig) {
      res.status(500).json({
        error:
          "Twilio is not configured. Set TWILIO_SID and TWILIO_AUTH, plus TWILIO_FROM_NUMBER when you are ready to send.",
      });
      return;
    }

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid message payload" });
      return;
    }

    const { ticketId, body } = parsed.data;

    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { tenant: true },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.tenantId !== session.tenantId) {
        res.status(403).json({ error: "Ticket does not belong to your tenant" });
        return;
      }

      if (session.user.role === "STAFF") {
        if (!session.user.locationId) {
          res.status(403).json({ error: "Location access not configured for this user." });
          return;
        }
        if (ticket.locationId !== session.user.locationId) {
          res.status(403).json({ error: "You do not have permission to message this ticket." });
          return;
        }
      }

      if (!ticket.customerPhone) {
        res.status(400).json({ error: "Ticket does not have a customer phone number" });
        return;
      }

      const tenantId = session.tenantId;

      await sendSms({
        to: ticket.customerPhone,
        body,
      });

      const message = await prisma.message.create({
        data: {
          tenantId,
          ticketId,
          direction: "OUTBOUND",
          body,
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

      res.json({ message });
    } catch (error) {
      console.error("Failed to send message", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  router.post("/api/messages/inbound", async (req, res) => {
    console.log("=".repeat(80));
    console.log("📨 [WEBHOOK] Inbound message webhook received");
    console.log("   Timestamp:", new Date().toISOString());
    console.log("   IP Address:", req.ip || req.socket.remoteAddress);
    console.log("   User-Agent:", req.headers["user-agent"] || "unknown");
    console.log("   Content-Type:", req.headers["content-type"] || "unknown");
    console.log("   Raw request body:", JSON.stringify(req.body, null, 2));
    console.log("   Request headers:", JSON.stringify(req.headers, null, 2));

    const bodyRaw = typeof req.body?.Body === "string" ? req.body.Body : "";
    const fromRaw = typeof req.body?.From === "string" ? req.body.From : "";
    const toRaw = typeof req.body?.To === "string" ? req.body.To : "";

    console.log("📋 [WEBHOOK] Extracted fields:", {
      from: fromRaw,
      to: toRaw,
      body: bodyRaw,
      bodyLength: bodyRaw.length,
    });

    if (!fromRaw) {
      console.log("⚠️ [WEBHOOK] No 'From' field in request, ignoring");
      console.log("=".repeat(80));
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    const normalizedFrom = normalizePhoneNumber(fromRaw);
    const possiblePhones = generatePhoneVariations(fromRaw);

    console.log("🔍 [WEBHOOK] Phone normalization:", {
      original: fromRaw,
      normalized: normalizedFrom,
      possibleMatches: possiblePhones,
      matchCount: possiblePhones.length,
    });

    const trimmedBody = bodyRaw.trim();
    const normalizedBody = trimmedBody.toLowerCase();

    // Try to extract ticket number from message body
    // Only extract if it looks like a ticket number (not just any word)
    const ticketNumberPatterns = [
      /ticket[-\s]?([a-z0-9-]+)/i,  // "ticket-1234" or "ticket 1234"
      /#([a-z0-9-]+)/i,              // "#1234"
      /^([a-z0-9-]{3,})$/i,          // Only if it's 3+ alphanumeric chars (not short words like "Hi")
    ];

    let extractedTicketNumber: string | null = null;
    for (const pattern of ticketNumberPatterns) {
      const match = trimmedBody.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Only use it if it looks like a ticket number (has numbers or is longer than 2 chars)
        if (/\d/.test(candidate) || candidate.length > 2) {
          extractedTicketNumber = candidate;
          break;
        }
      }
    }

    try {
      // Debug: List all active tickets with their phone numbers for troubleshooting
      const allActiveTickets = await prisma.ticket.findMany({
        where: {
          status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
        },
        select: {
          ticketNumber: true,
          customerPhone: true,
          customerName: true,
          status: true,
        },
        take: 10,
      });

      // Generate variations for each ticket's phone number to see if any match
      const ticketPhoneVariations = allActiveTickets.map(t => ({
        ticketNumber: t.ticketNumber,
        originalPhone: t.customerPhone,
        variations: generatePhoneVariations(t.customerPhone),
        matches: generatePhoneVariations(t.customerPhone).some(v => possiblePhones.includes(v)),
      }));

      console.log("🔎 [WEBHOOK] Searching for ticket:", {
        phones: possiblePhones,
        extractedTicketNumber,
        statusFilter: ["CHECKED_IN", "READY_FOR_PICKUP"],
      });
      console.log("📋 [WEBHOOK] Active tickets in database:", allActiveTickets.map(t => ({
        ticketNumber: t.ticketNumber,
        customerPhone: t.customerPhone,
        customerName: t.customerName,
        status: t.status,
      })));
      console.log("🔗 [WEBHOOK] Phone number matching analysis:", ticketPhoneVariations.map(t => ({
        ticketNumber: t.ticketNumber,
        originalPhone: t.originalPhone,
        hasMatch: t.matches,
        variationCount: t.variations.length,
      })));

      // First, try to find ticket by phone number
      let ticket = await prisma.ticket.findFirst({
        where: {
          status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
          customerPhone: { in: possiblePhones },
        },
        include: {
          location: true,
          payments: {
            select: {
              amountCents: true,
              status: true,
            },
          },
        },
        orderBy: {
          checkInTime: "desc",
        },
      });

      // If no ticket found by phone, try by ticket number (if extracted)
      if (!ticket && extractedTicketNumber) {
        console.log("🔍 [WEBHOOK] Phone match failed, trying ticket number:", extractedTicketNumber);
        
        // Try case-sensitive first
        ticket = await prisma.ticket.findFirst({
          where: {
            status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
            ticketNumber: extractedTicketNumber,
            customerPhone: { in: possiblePhones },
          },
          include: {
            location: true,
            payments: {
              select: {
                amountCents: true,
                status: true,
              },
            },
          },
          orderBy: {
            checkInTime: "desc",
          },
        });

        if (!ticket) {
          // Try case-insensitive by getting all tickets and filtering
          const allTickets = await prisma.ticket.findMany({
            where: {
              status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
              customerPhone: { in: possiblePhones },
            },
            include: {
              location: true,
              payments: {
                select: {
                  amountCents: true,
                  status: true,
                },
              },
            },
            orderBy: {
              checkInTime: "desc",
            },
          });
          
          ticket = allTickets.find(
            (t) => extractedTicketNumber && t.ticketNumber.toLowerCase() === extractedTicketNumber.toLowerCase()
          ) || null;
        }

        if (!ticket && extractedTicketNumber) {
          // If still no match, try without phone verification (less secure but more flexible)
          console.log("🔍 [WEBHOOK] Trying ticket number without phone verification");
          const allTicketsNoPhone = await prisma.ticket.findMany({
            where: {
              status: { in: ["CHECKED_IN", "READY_FOR_PICKUP"] },
            },
            include: {
              location: true,
              payments: {
                select: {
                  amountCents: true,
                  status: true,
                },
              },
            },
            orderBy: {
              checkInTime: "desc",
            },
          });
          
          ticket = allTicketsNoPhone.find(
            (t) => extractedTicketNumber && t.ticketNumber.toLowerCase() === extractedTicketNumber.toLowerCase()
          ) || null;
        }
      }

      if (!ticket) {
        console.log("❌ [WEBHOOK] No ticket found for:", {
          phones: possiblePhones,
          ticketNumber: extractedTicketNumber,
        });
        console.log("   This message will NOT be saved to the database.");
        console.log("=".repeat(80));
        res.type("text/xml").send("<Response></Response>");
        return;
      }

      console.log("✅ [WEBHOOK] Ticket found:", {
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        status: ticket.status,
        location: ticket.location.name,
        tenantId: ticket.tenantId,
        matchedBy: extractedTicketNumber && ticket.ticketNumber.toLowerCase() === extractedTicketNumber.toLowerCase() 
          ? "ticket-number" 
          : "phone-number",
      });

      console.log("💾 [WEBHOOK] Saving message to database...");

      const message = await prisma.message.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          direction: "INBOUND",
          body: trimmedBody,
          deliveryStatus: "RECEIVED",
          metadata: {
            from: normalizedFrom,
            rawFrom: fromRaw,
            to: toRaw,
          },
        },
      });

      console.log("✅ [WEBHOOK] Message saved:", {
        messageId: message.id,
        ticketId: ticket.id,
        body: trimmedBody.slice(0, 50) + (trimmedBody.length > 50 ? "..." : ""),
      });

      await prisma.auditLog.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          userId: null,
          action: "MESSAGE_SENT",
          details: {
            direction: "INBOUND",
            bodyPreview: trimmedBody.slice(0, 120),
            from: normalizedFrom,
          },
        },
      });

      const amountPaidCents = ticket.payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + payment.amountCents, 0);

      const projectedAmountCents = calculateProjectedAmountCents(ticket);
      const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);

      const isPickupRequest = REQUEST_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
      const isYesReply = YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
      
      // Treat "YES" replies as pickup requests (per plan: "Reply YES to request your car now")
      const isPickupOrYes = isPickupRequest || isYesReply;

      console.log("🤖 [WEBHOOK] Processing message:", {
        isPickupRequest,
        isYesReply,
        isPickupOrYes,
        bodyPreview: trimmedBody.slice(0, 50),
        outstandingAmountCents,
        amountPaidCents,
        projectedAmountCents,
        rateType: ticket.rateType,
        inOutPrivileges: ticket.inOutPrivileges,
      });

      if (isPickupOrYes) {
        // Check if payment is complete first
        const paymentComplete = outstandingAmountCents <= 0;

        if (!paymentComplete && hasTwilioConfig && !isSmsSendingDisabled) {
          // Payment not complete - send payment link
          console.log("💳 [WEBHOOK] Payment incomplete, sending payment link. Outstanding:", outstandingAmountCents);
          await sendPaymentLinkForTicket({
            ticket,
            tenantId: ticket.tenantId,
            amountCents: outstandingAmountCents,
            message: `Thanks ${ticket.customerName}! To request your car for ticket ${ticket.ticketNumber}, please complete your payment of $${(
              outstandingAmountCents / 100
            ).toFixed(2)}. Pay here:`,
            automated: true,
            metadata: { initiatedBy: "pickup_request_no_payment" },
            auditContext: {
              requestSource: "customer_pickup_request",
              outstandingAmountCents,
            },
            reason: "pickup_request_payment_required",
          });
          console.log("✅ [WEBHOOK] Payment link sent - payment required before pickup");
        } else if (paymentComplete && hasTwilioConfig && !isSmsSendingDisabled) {
          // Payment complete - acknowledge and update status to READY_FOR_PICKUP
          console.log("✅ [WEBHOOK] Payment complete, updating ticket to READY_FOR_PICKUP");
          
          // Update ticket status
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              status: "READY_FOR_PICKUP",
            },
          });

          // Create audit log
          await prisma.auditLog.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              userId: null,
              action: "STATUS_CHANGED",
              details: {
                ticketNumber: ticket.ticketNumber,
                oldStatus: ticket.status,
                newStatus: "READY_FOR_PICKUP",
                reason: "customer_pickup_request",
                paymentComplete: true,
              },
            },
          });

          // Send acknowledgement
          const acknowledgement = `Thanks ${ticket.customerName}! Your car is being prepared for pickup. We'll have ticket ${ticket.ticketNumber} ready shortly.`;

          console.log("📤 [WEBHOOK] Sending pickup acknowledgement");
          await sendSms({
            to: ticket.customerPhone,
            body: acknowledgement,
          });

          await recordOutboundMessage({
            tenantId: ticket.tenantId,
            ticketId: ticket.id,
            body: acknowledgement,
            automated: true,
            metadata: { reason: "pickup_acknowledgement_ready" },
          });
          console.log("✅ [WEBHOOK] Ticket updated to READY_FOR_PICKUP, acknowledgement sent");
          
          // TODO: Send push notification to staff (PWA implementation pending)
          console.log("📱 [WEBHOOK] TODO: Send push notification to staff for ticket:", ticket.ticketNumber);
        } else if (!hasTwilioConfig || isSmsSendingDisabled) {
          console.log("⚠️ [WEBHOOK] Twilio not configured or SMS disabled - cannot send response");
        }
      } else if (ticket.inOutPrivileges) {
        if (YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword))) {
          console.log("✅ [WEBHOOK] Customer indicated they will return vehicle");
          await prisma.auditLog.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              userId: null,
              action: "MESSAGE_SENT",
              details: {
                direction: "INBOUND",
                message: "Customer plans to return vehicle.",
              },
            },
          });
        } else if (NO_KEYWORDS.some((keyword) => normalizedBody.includes(keyword))) {
          console.log("❌ [WEBHOOK] Customer indicated they will NOT return vehicle");
          await prisma.auditLog.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              userId: null,
              action: "MESSAGE_SENT",
              details: {
                direction: "INBOUND",
                message: "Customer does not plan to return vehicle.",
              },
            },
          });
        }
      }

      console.log("✅ [WEBHOOK] Message processing complete");
      console.log("=".repeat(80));
      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      console.error("❌ [WEBHOOK] Failed to process inbound message:", error);
      console.error("   Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      console.log("=".repeat(80));
      res.type("text/xml").send("<Response></Response>");
    }
  });
}

