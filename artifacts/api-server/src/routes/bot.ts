import { Router, type IRouter } from "express";
import { GetBotStatusResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bot/status", async (_req, res): Promise<void> => {
  res.json(
    GetBotStatusResponse.parse({
      connected: false,
      provider: "WhatsApp Business",
      label: "Pendiente de conexión",
      webhookReady: false,
    }),
  );
});

export default router;