import twilio from "twilio";

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;

export const hasTwilioConfig = Boolean(accountSid && authToken);
export const isSmsSendingDisabled = process.env.DISABLE_SMS_SENDING === "true" || process.env.DISABLE_SMS_SENDING === "1";

const twilioClient = hasTwilioConfig ? twilio(accountSid, authToken) : null;

type SendMessageArgs = {
  to: string;
  body: string;
  from?: string | null;
};

export async function sendSms({ to, body, from }: SendMessageArgs) {
  if (isSmsSendingDisabled) {
    throw new Error("SMS sending is currently disabled. Set DISABLE_SMS_SENDING=false to enable.");
  }

  if (!twilioClient) {
    throw new Error("Twilio is not configured. Set TWILIO_SID and TWILIO_AUTH.");
  }

  const fromNumber = from ?? process.env.TWILIO_FROM_NUMBER;

  if (!fromNumber) {
    throw new Error("Missing TWILIO_FROM_NUMBER configuration.");
  }

  const message = await twilioClient.messages.create({
    to,
    from: fromNumber,
    body,
  });

  return message;
}

