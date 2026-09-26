import { Router, type IRouter } from "express";
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
  listConversationMessages,
  ManualReplyError,
  processConversationMessage,
  resetConversation,
  sendReceptionReply,
  setConversationStatus,
} from "../lib/conversation-engine";
import { whatsappConfigured } from "../lib/whatsapp";
import { requireReception } from "../middlewares/requireReception";

const router: IRouter = Router();
router.use("/bot", requireReception);

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