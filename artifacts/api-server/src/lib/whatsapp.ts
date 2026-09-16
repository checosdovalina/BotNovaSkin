import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v23.0";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      !process.env.WHATSAPP_ACCESS_TOKEN.includes("TOKEN_DE_ACCESO") &&
      !process.env.WHATSAPP_PHONE_NUMBER_ID.includes("PHONE_NUMBER_ID"),
  );
}

export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!rawBody || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
  );
  const received = Buffer.from(signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<string | undefined> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials are not configured");
  }
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    logger.error(
      { status: response.status, code: payload.error?.code },
      "WhatsApp message send failed",
    );
    throw new Error(
      payload.error?.message ?? `WhatsApp returned ${response.status}`,
    );
  }
  return payload.messages?.[0]?.id;
}