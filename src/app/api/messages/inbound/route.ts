import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../server/lib/prisma";
import { hasTwilioConfig, isSmsSendingDisabled, sendSms } from "../../../../../server/lib/twilio";
import { calculateProjectedAmountCents } from "../../../../../server/utils/pricing";
import { sendPaymentLinkForTicket } from "../../../../../server/routes/payments";
import {
  REQUEST_KEYWORDS,
  RETURN_YES_KEYWORDS,
  RETURN_NO_KEYWORDS,
  hasInOutPrivileges,
  normalizePhoneNumber,
  generatePhoneVariations,
} from "@/lib/message-helpers";

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

export async function POST(req: NextRequest) {
  console.log("=".repeat(80));
  console.log("📨 [WEBHOOK] Inbound message webhook received");
  console.log("   Timestamp:", new Date().toISOString());
  console.log("   IP Address:", req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown");
  console.log("   User-Agent:", req.headers.get("user-agent") || "unknown");
  console.log("   Content-Type:", req.headers.get("content-type") || "unknown");

  try {
    // Twilio sends form-encoded data, not JSON
    const formData = await req.formData();
    const bodyRaw = formData.get("Body")?.toString() || "";
    const fromRaw = formData.get("From")?.toString() || "";
    const toRaw = formData.get("To")?.toString() || "";

    const bodyObj: Record<string, string> = {};
    formData.forEach((value, key) => {
      bodyObj[key] = value.toString();
    });

    console.log("   Raw request body:", JSON.stringify(bodyObj, null, 2));
    console.log("   Request headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

    console.log("📋 [WEBHOOK] Extracted fields:", {
      from: fromRaw,
      to: toRaw,
      body: bodyRaw,
      bodyLength: bodyRaw.length,
    });

    if (!fromRaw) {
      console.log("⚠️ [WEBHOOK] No 'From' field in request, ignoring");
      console.log("=".repeat(80));
      return new NextResponse("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
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
    const ticketNumberPatterns = [
      /ticket[-\s]?([a-z0-9-]+)/i,
      /#([a-z0-9-]+)/i,
      /^([a-z0-9-]{3,})$/i,
    ];

    let extractedTicketNumber: string | null = null;
    for (const pattern of ticketNumberPatterns) {
      const match = trimmedBody.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (/\d/.test(candidate) || candidate.length > 2) {
          extractedTicketNumber = candidate;
          break;
        }
      }
    }

    // Debug: List all active tickets with their phone numbers
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

    // If no ticket found by phone, try by ticket number
    if (!ticket && extractedTicketNumber) {
      console.log("🔍 [WEBHOOK] Phone match failed, trying ticket number:", extractedTicketNumber);
      
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
      return new NextResponse("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
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

    const ticketForPricing = {
      rateType: ticket.rateType,
      inOutPrivileges: ticket.inOutPrivileges,
      checkInTime: ticket.checkInTime,
      checkOutTime: ticket.checkOutTime,
      durationDays: ticket.durationDays,
      durationHours: ticket.durationHours,
      location: {
        identifier: ticket.location.identifier,
        overnightRateCents: ticket.location.overnightRateCents,
        pricingTiers: (ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
      },
    };
    const projectedAmountCents = calculateProjectedAmountCents(ticketForPricing);
    const outstandingAmountCents = Math.max(projectedAmountCents - amountPaidCents, 0);

    const isPickupRequest = REQUEST_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
    const isYesReply = RETURN_YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
    const isNoReply = RETURN_NO_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
    
    const ticketHasInOut = hasInOutPrivileges({
      rateType: ticket.rateType,
      inOutPrivileges: ticket.inOutPrivileges,
      location: {
        overnightInOutPrivileges: ticket.location.overnightInOutPrivileges,
        pricingTiers: ticket.location.pricingTiers,
      },
    });
    
    const ticketWithReturn = await prisma.ticket.findUnique({
      where: { id: ticket.id },
    });
    
    const isReturnConfirmation = ticket.status === "READY_FOR_PICKUP" && 
                                 ticketHasInOut && 
                                 ticketWithReturn && 
                                 ticketWithReturn.willReturn === null && 
                                 (RETURN_YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword)) || 
                                  RETURN_NO_KEYWORDS.some((keyword) => normalizedBody.includes(keyword)));
    
    const isPickupOrYes = isPickupRequest || (isYesReply && !isReturnConfirmation);

    console.log("🤖 [WEBHOOK] Processing message:", {
      isPickupRequest,
      isYesReply,
      isNoReply,
      isReturnConfirmation,
      isPickupOrYes,
      bodyPreview: trimmedBody.slice(0, 50),
      outstandingAmountCents,
      amountPaidCents,
      projectedAmountCents,
      rateType: ticket.rateType,
      inOutPrivileges: ticket.inOutPrivileges,
      willReturn: ticketWithReturn?.willReturn,
    });

    // Handle return confirmation
    if (isReturnConfirmation) {
      const willReturn = RETURN_YES_KEYWORDS.some((keyword) => normalizedBody.includes(keyword));
      console.log(`✅ [WEBHOOK] Customer ${willReturn ? "WILL" : "WILL NOT"} return vehicle`);
      
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          willReturn,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          userId: null,
          action: "MESSAGE_SENT",
          details: {
            direction: "INBOUND",
            message: willReturn ? "Customer plans to return vehicle." : "Customer does not plan to return vehicle.",
            willReturn,
          },
        },
      });

      if (hasTwilioConfig && !isSmsSendingDisabled) {
        const confirmation = willReturn 
          ? `Got it! We'll keep your spot ready for your return.`
          : `Thanks for letting us know!`;
        
        await sendSms({
          to: ticket.customerPhone,
          body: confirmation,
        });

        await recordOutboundMessage({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          body: confirmation,
          automated: true,
          metadata: { reason: "return_confirmation_acknowledgement", willReturn },
        });
        console.log("✅ [WEBHOOK] Return confirmation acknowledged");
      }
    } else if (isPickupOrYes) {
      const paymentComplete = outstandingAmountCents <= 0;

      if (!paymentComplete && hasTwilioConfig && !isSmsSendingDisabled) {
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
        console.log("✅ [WEBHOOK] Payment complete, updating ticket to READY_FOR_PICKUP");
        
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: "READY_FOR_PICKUP",
          },
        });

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
              willReturn: ticket.willReturn,
            },
          },
        });

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
        
        const ticketHasInOutAfter = hasInOutPrivileges({
          rateType: ticket.rateType,
          inOutPrivileges: ticket.inOutPrivileges,
          location: {
            overnightInOutPrivileges: ticket.location.overnightInOutPrivileges,
            pricingTiers: ticket.location.pricingTiers,
          },
        });
        
        const ticketWithReturnAfter = await prisma.ticket.findUnique({
          where: { id: ticket.id },
        });
        
        if (ticketHasInOutAfter && ticketWithReturnAfter && ticketWithReturnAfter.willReturn === null) {
          console.log("🔄 [WEBHOOK] Customer has in/out privileges, asking about return after pickup request");
          const returnQuestion = `Will you be returning with your car today? Reply RETURN if returning, or NOT RETURNING if not.`;
          
          await sendSms({
            to: ticket.customerPhone,
            body: returnQuestion,
          });

          await recordOutboundMessage({
            tenantId: ticket.tenantId,
            ticketId: ticket.id,
            body: returnQuestion,
            automated: true,
            metadata: { reason: "return_confirmation_question_after_pickup" },
          });
          console.log("✅ [WEBHOOK] Return confirmation question sent after pickup request");
        }
        
        console.log("📱 [WEBHOOK] TODO: Send push notification to staff for ticket:", ticket.ticketNumber);
      } else if (!hasTwilioConfig || isSmsSendingDisabled) {
        console.log("⚠️ [WEBHOOK] Twilio not configured or SMS disabled - cannot send response");
      }
    }

    console.log("✅ [WEBHOOK] Message processing complete");
    console.log("=".repeat(80));
    return new NextResponse("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("❌ [WEBHOOK] Failed to process inbound message:", error);
    console.error("   Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.log("=".repeat(80));
    return new NextResponse("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
      status: 500,
    });
  }
}

