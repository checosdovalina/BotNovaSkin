import { Router, type IRouter } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, localSessionsTable, localUsersTable } from "@workspace/db";
import { clearLoginFailurePair, isLoginRateLimited, recordLoginFailure } from "../lib/login-rate-limit";
import {
  clearSessionCookie,
  canCreateLocalRole,
  canManageLocalRole,
  createSession,
  hashPassword,
  hashSessionToken,
  isValidEmail,
  isValidPassword,
  newLocalUserId,
  normalizeEmail,
  optionalLocalAuth,
  readSessionToken,
  requireSameOrigin,
  requireLocalAuth,
  setSessionCookie,
  verifyPassword,
} from "../lib/local-auth";

const router: IRouter = Router();

router.get("/auth/me", optionalLocalAuth, (req, res) => {
  res.json({
    user: req.localUser ? {
      id: req.localUser.id,
      email: req.localUser.email,
      role: req.localUser.role,
    } : null,
  });
});

router.post("/auth/login", requireSameOrigin, async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!isValidEmail(email) || !password) {
    res.status(400).json({ error: "Correo o contraseña inválidos" });
    return;
  }
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (isLoginRateLimited(email, ip)) {
    res.status(429).json({ error: "Demasiados intentos de acceso. Intenta de nuevo más tarde." });
    return;
  }
  try {
    const [user] = await db.select().from(localUsersTable).where(eq(localUsersTable.email, email)).limit(1);
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      const limited = recordLoginFailure(email, ip);
      res.status(limited ? 429 : 401).json({
        error: limited ? "Demasiados intentos de acceso. Intenta de nuevo más tarde." : "Correo o contraseña incorrectos",
      });
      return;
    }
    clearLoginFailurePair(email, ip);
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    req.log.error({ error }, "Local login failed");
    res.status(503).json({ error: "No se pudo completar el acceso" });
  }
});

router.post("/auth/logout", requireLocalAuth, async (req, res): Promise<void> => {
  const token = readSessionToken(req);
  try {
    if (token) {
      await db.delete(localSessionsTable).where(eq(localSessionsTable.tokenHash, hashSessionToken(token)));
    }
    clearSessionCookie(res);
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ error }, "Local logout failed");
    res.status(503).json({ error: "No se pudo cerrar la sesión" });
  }
});

router.post("/auth/password", requireLocalAuth, async (req, res): Promise<void> => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || !isValidPassword(newPassword)) {
    res.status(400).json({ error: "La nueva contraseña debe tener al menos 12 caracteres" });
    return;
  }
  try {
    const changed = await db.transaction(async (tx) => {
      const [user] = await tx.select().from(localUsersTable)
        .where(eq(localUsersTable.id, req.localUser!.id)).for("update").limit(1);
      if (!user?.active || !(await verifyPassword(currentPassword, user.passwordHash))) {
        return false;
      }
      const passwordHash = await hashPassword(newPassword);
      await tx.update(localUsersTable).set({ passwordHash })
        .where(eq(localUsersTable.id, user.id));
      await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, user.id));
      return true;
    });
    if (!changed) {
      res.status(401).json({ error: "La contraseña actual es incorrecta" });
      return;
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ error }, "Local password change failed");
    res.status(503).json({ error: "No se pudo cambiar la contraseña" });
  }
});

router.get("/admin/users", requireLocalAuth, async (req, res): Promise<void> => {
  if (req.localUser?.role !== "admin" && req.localUser?.role !== "superadmin") {
    res.status(403).json({ error: "No tienes permisos para administrar cuentas" });
    return;
  }
  try {
    const users = await db.select({
      id: localUsersTable.id,
      email: localUsersTable.email,
      role: localUsersTable.role,
      active: localUsersTable.active,
    }).from(localUsersTable)
      .where(req.localUser.role === "admin"
        ? or(eq(localUsersTable.role, "staff"), eq(localUsersTable.id, req.localUser.id))
        : undefined)
      .orderBy(localUsersTable.email);
    res.json({ users });
  } catch (error) {
    req.log.error({ error }, "Could not list local users");
    res.status(503).json({ error: "No se pudieron consultar las cuentas" });
  }
});

router.post("/admin/users", requireLocalAuth, async (req, res): Promise<void> => {
  if (req.localUser?.role !== "admin" && req.localUser?.role !== "superadmin") {
    res.status(403).json({ error: "No tienes permisos para administrar cuentas" });
    return;
  }
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role;
  if (role === "superadmin" ||
    ((role === "admin" || role === "staff") && !canCreateLocalRole(req.localUser.role, role))) {
    res.status(403).json({ error: "No tienes permisos para crear una cuenta con ese rol" });
    return;
  }
  if (!isValidEmail(email) || !isValidPassword(password) || !["admin", "staff"].includes(role)) {
    res.status(400).json({ error: "Correo, rol o contraseña inválidos (mínimo 12 caracteres)" });
    return;
  }
  try {
    const id = newLocalUserId();
    const [user] = await db.insert(localUsersTable).values({
      id, email, passwordHash: await hashPassword(password), role,
    }).returning({
      id: localUsersTable.id,
      email: localUsersTable.email,
      role: localUsersTable.role,
      active: localUsersTable.active,
    });
    res.status(201).json({ user });
  } catch (error) {
    req.log.error({ error }, "Could not create local user");
    const code = (error as { code?: string }).code;
    res.status(code === "23505" ? 409 : 503).json({
      error: code === "23505" ? "Ya existe una cuenta con ese correo" : "No se pudo crear la cuenta",
    });
  }
});

router.patch("/admin/users/:id", requireLocalAuth, async (req, res): Promise<void> => {
  if (req.localUser?.role !== "admin" && req.localUser?.role !== "superadmin") {
    res.status(403).json({ error: "No tienes permisos para administrar cuentas" });
    return;
  }
  const { active, role } = req.body ?? {};
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  if (role === "superadmin" ||
    ((role === "admin" || role === "staff") && !canCreateLocalRole(req.localUser.role, role))) {
    res.status(403).json({ error: "No tienes permisos para asignar ese rol" });
    return;
  }
  if ((active !== undefined && typeof active !== "boolean") ||
    (role !== undefined && !["admin", "staff"].includes(role)) ||
    (req.body?.password !== undefined && (!password || !isValidPassword(password))) ||
    (active === undefined && role === undefined && password === undefined)) {
    res.status(400).json({ error: "Actualización de cuenta inválida" });
    return;
  }
  const targetId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!targetId) {
    res.status(404).json({ error: "Cuenta no encontrada" });
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      // Serialize account changes and defensively protect the final active superadmin.
      await tx.select({ id: localUsersTable.id }).from(localUsersTable).for("update");
      const [target] = await tx.select().from(localUsersTable)
        .where(eq(localUsersTable.id, targetId)).limit(1);
      if (!target) return { missing: true as const };
      if (!canManageLocalRole(req.localUser!.role, target.role)) {
        return { forbidden: true as const };
      }
      const nextRole = role ?? target.role;
      const nextActive = active ?? target.active;
      if (target.active && target.role === "superadmin" && (!nextActive || nextRole !== "superadmin")) {
        const admins = await tx.select({ id: localUsersTable.id }).from(localUsersTable)
          .where(and(eq(localUsersTable.active, true), eq(localUsersTable.role, "superadmin")));
        if (admins.length <= 1) return { lastSuperadmin: true as const };
      }
      const values: { active?: boolean; role?: "admin" | "staff"; passwordHash?: string } = {};
      if (active !== undefined) values.active = active;
      if (role !== undefined) values.role = role;
      if (password !== undefined) values.passwordHash = await hashPassword(password);
      const revokeSessions = (active !== undefined && active !== target.active) ||
        (role !== undefined && role !== target.role) || password !== undefined;
      const [user] = await tx.update(localUsersTable).set(values)
        .where(eq(localUsersTable.id, target.id)).returning({
          id: localUsersTable.id,
          email: localUsersTable.email,
          role: localUsersTable.role,
          active: localUsersTable.active,
        });
      if (revokeSessions) {
        await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, target.id));
      }
      return { user, revokeSessions };
    });
    if ("missing" in updated) {
      res.status(404).json({ error: "Cuenta no encontrada" });
      return;
    }
    if ("forbidden" in updated) {
      res.status(403).json({ error: "No tienes permisos para modificar esta cuenta" });
      return;
    }
    if ("lastSuperadmin" in updated) {
      res.status(409).json({ error: "No se puede desactivar o degradar al último superadministrador activo" });
      return;
    }
    res.json({ user: updated.user });
  } catch (error) {
    req.log.error({ error }, "Could not update local user");
    res.status(503).json({ error: "No se pudo actualizar la cuenta" });
  }
});

export default router;