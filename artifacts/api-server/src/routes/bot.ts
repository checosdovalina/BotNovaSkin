import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db, receptionPushSubscriptionsTable, receptionWhatsappAlertsTable } from "@workspace/db";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import {
  GetBotStatusResponse,
  ListBotConversationMessagesParams,
  ListBotConversationMessagesResponse,
  ListBotConversationsQueryParams,
  ListBotConversationsResponse,
  SendBotConversationMessageBody,
  SendBotConversationMessageParams,
  SendBotConversationMessageResponse,
  SimulateBotBody,
  SimulateBotResponse,
  UpdateBotConversationBody,
  UpdateBotConversationParams,
  UpdateBotConversationResponse,
  GetReceptionPushKeyResponse,
  SubscribeReceptionPushBody,
  UnsubscribeReceptionPushBody,
  GetReceptionAlternateAlertResponse,
  UpdateReceptionAlternateAlertBody,
  UpdateReceptionAlternateAlertResponse,
  ConfirmReceptionAlternateAlertBody,
  ConfirmReceptionAlternateAlertResponse,
} from "@workspace/api-zod";
import {
  listConversations,
  listConversationMessages,
  ManualReplyError,
  processConversationMessage,
  resetConversation,
  sendReceptionReply,
  setConversationStatus,
} from "../lib/conversation-engine";
import { sendWhatsAppTemplate, whatsappConfigured } from "../lib/whatsapp";
import { requireReception } from "../middlewares/requireReception";
import { alternateAlertsAvailable, getPushKeys, validPushEndpoint } from "../lib/reception-push";

const router: IRouter = Router();
router.use("/bot", requireReception);

function verificationHash(userId: string, phone: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for WhatsApp verification");
  return createHmac("sha256", secret).update(`${userId}:${phone}:${code}`).digest("hex");
}

router.get("/bot/alternate-alert", async (req, res): Promise<void> => {
  const [entry] = await db.select().from(receptionWhatsappAlertsTable)
    .where(eq(receptionWhatsappAlertsTable.userId, getAuth(req).userId!));
  res.json(GetReceptionAlternateAlertResponse.parse({
    enabled: Boolean(entry?.verifiedAt), pending: Boolean(entry && !entry.verifiedAt),
    available: alternateAlertsAvailable(), ...(entry ? { phone: entry.phone } : {}),
  }));
});

router.put("/bot/alternate-alert", async (req, res): Promise<void> => {
  const parsed = UpdateReceptionAlternateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Introduce el teléfono con código de país, sin espacios ni signo +." });
    return;
  }
  if (!alternateAlertsAvailable() || !process.env.RECEPTION_WHATSAPP_VERIFY_TEMPLATE || !process.env.SESSION_SECRET) {
    res.status(503).json({ error: "Los avisos por WhatsApp aún no están configurados." });
    return;
  }
  const userId = getAuth(req).userId!;
  const [existing] = await db.select().from(receptionWhatsappAlertsTable).where(eq(receptionWhatsappAlertsTable.userId, userId));
  if (existing?.verifiedAt && existing.phone === parsed.data.phone) {
    res.json(UpdateReceptionAlternateAlertResponse.parse({
      enabled: true, available: true, phone: existing.phone, pending: false,
    }));
    return;
  }
  const now = new Date();
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const codeHash = verificationHash(userId, parsed.data.phone, code);
  const [pending] = await db.insert(receptionWhatsappAlertsTable).values({
    userId, phone: parsed.data.phone, codeHash, codeSentAt: now,
    codeExpiresAt: new Date(now.getTime() + 10 * 60_000),
  }).onConflictDoUpdate({
    target: receptionWhatsappAlertsTable.userId,
    set: {
      phone: parsed.data.phone, verifiedAt: null, codeHash, codeSentAt: now,
      codeExpiresAt: new Date(now.getTime() + 10 * 60_000), attempts: 0,
    },
    // Only accepted changes revoke the old number; throttle all requests, including new numbers.
    setWhere: or(
      lt(receptionWhatsappAlertsTable.codeSentAt, new Date(now.getTime() - 60_000)),
      isNull(receptionWhatsappAlertsTable.codeSentAt),
    ),
  }).returning();
  if (!pending) {
    res.status(429).json({ error: "Espera un minuto antes de solicitar otro código." });
    return;
  }
  try {
    await sendWhatsAppTemplate(parsed.data.phone, process.env.RECEPTION_WHATSAPP_VERIFY_TEMPLATE!, "es_MX", [code]);
  } catch (error) {
    req.log.warn({ error }, "Reception verification message failed");
    // Leave delivery disabled; allow another attempt without waiting for the cooldown.
    await db.update(receptionWhatsappAlertsTable).set({ codeSentAt: null })
      .where(and(eq(receptionWhatsappAlertsTable.userId, userId), eq(receptionWhatsappAlertsTable.codeHash, codeHash)));
    res.status(503).json({ error: "No se pudo enviar el código. Intenta de nuevo." });
    return;
  }
  res.json(UpdateReceptionAlternateAlertResponse.parse({
    enabled: false, pending: true, available: true, phone: parsed.data.phone,
  }));
});

router.post("/bot/alternate-alert/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmReceptionAlternateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Introduce el código de ocho dígitos." });
    return;
  }
  const userId = getAuth(req).userId!;
  // Atomically consume one of five attempts even under concurrent requests.
  const [entry] = await db.update(receptionWhatsappAlertsTable)
    .set({ attempts: sql`${receptionWhatsappAlertsTable.attempts} + 1` })
    .where(and(eq(receptionWhatsappAlertsTable.userId, userId), isNull(receptionWhatsappAlertsTable.verifiedAt),
      gt(receptionWhatsappAlertsTable.codeExpiresAt, new Date()), lt(receptionWhatsappAlertsTable.attempts, 5)))
    .returning();
  if (!entry?.codeHash) {
    res.status(400).json({ error: "El código expiró o se agotaron los intentos. Solicita otro." });
    return;
  }
  const received = Buffer.from(verificationHash(userId, entry.phone, parsed.data.code), "hex");
  const expected = Buffer.from(entry.codeHash, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    res.status(400).json({ error: "Código incorrecto." });
    return;
  }
  const [verified] = await db.update(receptionWhatsappAlertsTable)
    .set({ verifiedAt: new Date(), codeHash: null, codeExpiresAt: null, codeSentAt: null })
    .where(and(eq(receptionWhatsappAlertsTable.userId, userId), eq(receptionWhatsappAlertsTable.codeHash, entry.codeHash),
      eq(receptionWhatsappAlertsTable.phone, entry.phone), isNull(receptionWhatsappAlertsTable.verifiedAt),
      gt(receptionWhatsappAlertsTable.codeExpiresAt, new Date())))
    .returning();
  if (!verified) {
    res.status(400).json({ error: "El código ya no es válido. Solicita otro." });
    return;
  }
  res.json(ConfirmReceptionAlternateAlertResponse.parse({
    enabled: true, pending: false, available: alternateAlertsAvailable(), phone: verified.phone,
  }));
});

router.delete("/bot/alternate-alert", async (req, res): Promise<void> => {
  await db.delete(receptionWhatsappAlertsTable).where(eq(receptionWhatsappAlertsTable.userId, getAuth(req).userId!));
  res.sendStatus(204);
});

router.get("/bot/push", async (_req, res): Promise<void> => {
  const keys = await getPushKeys();
  res.json(GetReceptionPushKeyResponse.parse({ publicKey: keys.publicKey }));
});

router.post("/bot/push", async (req, res): Promise<void> => {
  const parsed = SubscribeReceptionPushBody.safeParse(req.body);
  if (!parsed.success || !validPushEndpoint(parsed.data.endpoint)) {
    res.status(400).json({ error: "Suscripción de navegador inválida" });
    return;
  }
  const userId = getAuth(req).userId!;
  await db.insert(receptionPushSubscriptionsTable).values({
    endpoint: parsed.data.endpoint, userId,
    p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth,
  }).onConflictDoUpdate({
    target: receptionPushSubscriptionsTable.endpoint,
    set: { userId, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
  });
  res.sendStatus(204);
});

router.delete("/bot/push", async (req, res): Promise<void> => {
  const parsed = UnsubscribeReceptionPushBody.safeParse(req.body);
  if (!parsed.success || !validPushEndpoint(parsed.data.endpoint)) {
    res.status(400).json({ error: "Suscripción de navegador inválida" });
    return;
  }
  await db.delete(receptionPushSubscriptionsTable).where(and(
    eq(receptionPushSubscriptionsTable.endpoint, parsed.data.endpoint),
    eq(receptionPushSubscriptionsTable.userId, getAuth(req).userId!),
  ));
  res.sendStatus(204);
});

router.get("/bot/status", async (_req, res): Promise<void> => {
  const connected = whatsappConfigured();
  res.json(
    GetBotStatusResponse.parse({
      connected,
      provider: "WhatsApp Business",
      label: connected
        ? `Número ••••${process.env.WHATSAPP_PHONE_NUMBER_ID?.slice(-4)}`
        : "Pendiente de credenciales",
      webhookReady: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    }),
  );
});

router.post("/bot/simulate", async (req, res): Promise<void> => {
  const parsed = SimulateBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const phone = `simulator:${parsed.data.sessionId}`;
  if (parsed.data.reset) {
    await resetConversation(phone);
  }
  const result = await processConversationMessage({
    phone,
    message: parsed.data.message,
    clientName: "Prueba del panel",
  });
  res.json(SimulateBotResponse.parse(result));
});

router.get("/bot/conversations", async (req, res): Promise<void> => {
  const rawStatus = Array.isArray(req.query.status)
    ? req.query.status[0]
    : req.query.status;
  const parsed = ListBotConversationsQueryParams.safeParse({
    status: rawStatus,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await listConversations(parsed.data.status);
  res.json(ListBotConversationsResponse.parse(rows));
});

router.patch("/bot/conversations/:id", async (req, res): Promise<void> => {
  const params = UpdateBotConversationParams.safeParse(req.params);
  const body = UpdateBotConversationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res
      .status(400)
      .json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const conversation = await setConversationStatus(
    params.data.id,
    body.data.status,
  );
  if (!conversation) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }
  res.json(
    UpdateBotConversationResponse.parse({
      id: conversation.id,
      status: conversation.status,
    }),
  );
});

router.get("/bot/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListBotConversationMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const messages = await listConversationMessages(params.data.id);
  if (!messages) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }
  res.json(ListBotConversationMessagesResponse.parse(messages));
});

router.post("/bot/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendBotConversationMessageParams.safeParse(req.params);
  const parsed = SendBotConversationMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.body.trim()) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message ?? "Mensaje vacío" });
    return;
  }
  try {
    const message = await sendReceptionReply(params.data.id, parsed.data.body.trim());
    res.status(201).json(SendBotConversationMessageResponse.parse(message));
  } catch (error) {
    if (error instanceof ManualReplyError) {
      res.status(error.code).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Could not send reception reply");
    res.status(503).json({ error: "WhatsApp no pudo enviar el mensaje. Intenta de nuevo." });
  }
});

export default router;