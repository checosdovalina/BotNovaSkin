import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const requireReceptionAccess: RequestHandler = (req, res, next) => {
  const password = process.env.RECEPTION_PASSWORD;
  if (!password) {
    res.status(503).json({ error: "La clave de recepción no está configurada" });
    return;
  }

  const authorization = req.header("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const digest = (value: string) =>
    createHash("sha256").update(value).digest();
  if (!provided || !timingSafeEqual(digest(provided), digest(password))) {
    res.status(401).json({ error: "Clave de recepción incorrecta" });
    return;
  }
  next();
};