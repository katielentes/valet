import { NextRequest, NextResponse } from "next/server";
import { resolveSessionFromRequest } from "@/lib/api-helpers";
import { hasTwilioConfig, isSmsSendingDisabled } from "../../../../../server/lib/twilio";

export async function GET(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = hasTwilioConfig;
  const disabled = isSmsSendingDisabled;
  
  let message = "";
  if (!configured) {
    message = "Twilio is not configured. Set TWILIO_SID and TWILIO_AUTH, plus TWILIO_FROM_NUMBER when you are ready to send.";
  } else if (disabled) {
    message = "SMS sending is currently disabled. Set DISABLE_SMS_SENDING=false to enable.";
  } else {
    message = "Messaging is configured and enabled.";
  }

  return NextResponse.json({
    configured,
    disabled,
    message,
  });
}

