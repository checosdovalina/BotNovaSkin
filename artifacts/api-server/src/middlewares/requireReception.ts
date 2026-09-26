import type { RequestHandler } from "express";

export const requireReception: RequestHandler = (req, res, next) => {
  const user = req.localUser;
  if (!user) {
    res.status(401).json({ error: "Inicia sesión para acceder a recepción" });
    return;
  }
  next();
};