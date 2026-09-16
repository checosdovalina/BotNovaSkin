import { Router, type IRouter } from "express";
import { processConversationMessage } from "../lib/conversation-engine";
import {
  sendWhatsAppText,
  verifyMetaSignature,
} from "../lib/whatsapp";

const router: IRouter = Router();

type WhatsAppMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

function messageBody(message: WhatsAppMessage): string | undefined {
  return (
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title
  );
}

router.get("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const mode = typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined;
  const token =
    typeof req.query["hub.verify_token"] === "string"
      ? req.query["hub.verify_token"]
      : undefined;
  const challenge =
    typeof req.query["hub.challenge"] === "string"
      ? req.query["hub.challenge"]
      : undefined;
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    expectedToken &&
    mode === "subscribe" &&
    token === expectedToken &&
    challenge
  ) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: "Webhook verification failed" });
});

router.post("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const signature = req.header("x-hub-signature-256");
  if (!verifyMetaSignature(req.rawBody, signature)) {
    req.log.warn("Rejected WhatsApp webhook with invalid signature");
    res.sendStatus(401);
    return;
  }

  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  let processed = 0;
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const clientName = contacts[0]?.profile?.name;
      const messages: WhatsAppMessage[] = Array.isArray(value?.messages)
        ? value.messages
        : [];
      for (const message of messages) {
        const body = messageBody(message);
        if (!message.from || !message.id) continue;
        if (!body) {
          await sendWhatsAppText(
            message.from,
            "Por ahora puedo atender mensajes de texto. Escribe *hola* para ver el menú.",
          );
          continue;
        }
        const result = await processConversationMessage({
          phone: message.from,
          message: body,
          providerMessageId: message.id,
          clientName,
        });
        if (result.reply) {
          await sendWhatsAppText(message.from, result.reply);
        }
        processed += 1;
      }
    }
  }
  req.log.info({ entryCount: entries.length, processed }, "WhatsApp webhook processed");
  res.sendStatus(200);
});

export default router;