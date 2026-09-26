import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { conversationsTable, conversationMessagesTable, db } from "@workspace/db";
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
} from "@workspace/api-zod";
import {
  listConversations,
  processConversationMessage,
  resetConversation,
  setConversationStatus,
} from "../lib/conversation-engine";
import { sendWhatsAppText, whatsappConfigured } from "../lib/whatsapp";
import { requireReceptionAccess } from "../lib/reception-auth";

const router: IRouter = Router();

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

router.use("/bot/conversations", requireReceptionAccess);

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
  const [conversation] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conversation) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }
  const messages = await db
    .select({
      id: conversationMessagesTable.id,
      direction: conversationMessagesTable.direction,
      body: conversationMessagesTable.body,
      status: conversationMessagesTable.status,
      createdAt: conversationMessagesTable.createdAt,
    })
    .from(conversationMessagesTable)
    .where(eq(conversationMessagesTable.conversationId, conversation.id))
    .orderBy(asc(conversationMessagesTable.createdAt), asc(conversationMessagesTable.id));
  res.json(ListBotConversationMessagesResponse.parse(messages));
});

router.post("/bot/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendBotConversationMessageParams.safeParse(req.params);
  const body = SendBotConversationMessageBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data?.message.trim()) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Escribe un mensaje" });
    return;
  }
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conversation) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }
  if (conversation.status !== "human") {
    res.status(409).json({ error: "La conversación ya no está asignada a recepción" });
    return;
  }
  if (!/^\d{7,15}$/.test(conversation.phone)) {
    res.status(400).json({ error: "No se puede enviar a una conversación del simulador" });
    return;
  }
  const [lastInbound] = await db
    .select({ createdAt: conversationMessagesTable.createdAt })
    .from(conversationMessagesTable)
    .where(and(
      eq(conversationMessagesTable.conversationId, conversation.id),
      eq(conversationMessagesTable.direction, "inbound"),
    ))
    .orderBy(desc(conversationMessagesTable.createdAt), desc(conversationMessagesTable.id))
    .limit(1);
  if (!lastInbound || Date.now() - lastInbound.createdAt.getTime() >= 24 * 60 * 60 * 1000) {
    res.status(409).json({ error: "La ventana de 24 horas terminó. Espera otro mensaje del cliente o usa una plantilla aprobada." });
    return;
  }
  if (!whatsappConfigured()) {
    res.status(503).json({ error: "WhatsApp Cloud API no está configurado" });
    return;
  }
  const text = body.data.message.trim();
  try {
    const providerMessageId = await sendWhatsAppText(conversation.phone, text);
    const [sent] = await db.insert(conversationMessagesTable).values({
      conversationId: conversation.id,
      providerMessageId,
      direction: "outbound",
      body: text,
      status: "sent",
    }).returning({
      id: conversationMessagesTable.id,
      direction: conversationMessagesTable.direction,
      body: conversationMessagesTable.body,
      status: conversationMessagesTable.status,
      createdAt: conversationMessagesTable.createdAt,
    });
    await db.update(conversationsTable)
      .set({ lastMessage: text, lastMessageAt: sent.createdAt, updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversation.id));
    res.json(SendBotConversationMessageResponse.parse(sent));
  } catch (error) {
    req.log.error({ error }, "Reception WhatsApp message failed");
    res.status(502).json({ error: "No se pudo confirmar el envío por WhatsApp. Revisa el estado antes de reintentar." });
  }
});

export default router;