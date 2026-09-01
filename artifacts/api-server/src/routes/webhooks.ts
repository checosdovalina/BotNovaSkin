import { Router, type IRouter } from "express";

const router: IRouter = Router();

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
  const entryCount = Array.isArray(req.body?.entry) ? req.body.entry.length : 0;
  req.log.info({ entryCount }, "WhatsApp webhook event received");
  res.sendStatus(200);
});

export default router;