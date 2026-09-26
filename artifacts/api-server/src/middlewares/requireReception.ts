import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireReception: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Inicia sesión para acceder a recepción" });
    return;
  }
  const allowed = (process.env.RECEPTION_ALLOWED_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) {
    res.status(403).json({ error: "Recepción no tiene personal autorizado configurado" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
    const email = primary?.verification?.status === "verified" ? primary.emailAddress.toLowerCase() : undefined;
    if (!email || !allowed.includes(email)) {
      res.status(403).json({ error: "Tu cuenta no está autorizada para recepción" });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ error }, "Could not verify reception access");
    res.status(503).json({ error: "No se pudo comprobar el acceso a recepción" });
  }
};