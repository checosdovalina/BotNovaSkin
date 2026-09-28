import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, localSessionsTable, localUsersTable } from "@workspace/db";

const SESSION_COOKIE = "vps_session";
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;

export type LocalRole = "staff" | "admin" | "superadmin";
export type PublicUser = { id: string; email: string; role: LocalRole };

export function canCreateLocalRole(actor: LocalRole, requested: unknown): requested is "staff" | "admin" {
  if (requested === "staff") return actor === "admin" || actor === "superadmin";
  return requested === "admin" && actor === "superadmin";
}

export function canManageLocalRole(actor: LocalRole, target: LocalRole): boolean {
  if (target === "superadmin") return false;
  if (actor === "superadmin") return target === "staff" || target === "admin";
  return actor === "admin" && target === "staff";
}

declare global {
  namespace Express {
    interface Request {
      localUser?: PublicUser;
    }
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return [...password].length >= 12;
}

function deriveScrypt(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N: 16_384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveScrypt(password, salt, PASSWORD_BYTES);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [saltHex, hashHex, extra] = encoded.split(":");
  if (extra !== undefined || !/^[a-f0-9]{32}$/.test(saltHex ?? "") ||
    !/^[a-f0-9]{128}$/.test(hashHex ?? "")) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await deriveScrypt(password, Buffer.from(saltHex, "hex"), PASSWORD_BYTES);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api",
    maxAge: SESSION_LIFETIME_MS,
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

export function readSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const pair = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = pair?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(localSessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
  });
  return token;
}

export function isSameOriginRequest(req: Request): boolean {
  const originHeader = req.header("origin");
  if (!originHeader) return false;
  try {
    const origin = new URL(originHeader);
    const host = req.get("host");
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || req.protocol;
    return origin.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "La solicitud no pertenece a este origen" });
    return;
  }
  next();
};

export const requireLocalAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "Inicia sesión para continuar" });
    return;
  }
  try {
    const [record] = await db.select({
      id: localUsersTable.id,
      email: localUsersTable.email,
      role: localUsersTable.role,
    }).from(localSessionsTable)
      .innerJoin(localUsersTable, eq(localSessionsTable.userId, localUsersTable.id))
      .where(and(
        eq(localSessionsTable.tokenHash, hashSessionToken(token)),
        gt(localSessionsTable.expiresAt, new Date()),
        eq(localUsersTable.active, true),
      )).limit(1);
    if (!record) {
      res.status(401).json({ error: "La sesión no es válida o ha expirado" });
      return;
    }
    req.localUser = { id: record.id, email: record.email, role: record.role };
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !isSameOriginRequest(req)) {
      res.status(403).json({ error: "La solicitud no pertenece a este origen" });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ error }, "Local authentication lookup failed");
    res.status(503).json({ error: "No se pudo comprobar la sesión" });
  }
};

export function requireRole(...roles: LocalRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.localUser) {
      res.status(401).json({ error: "Inicia sesión para continuar" });
      return;
    }
    if (!roles.includes(req.localUser.role)) {
      res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
      return;
    }
    next();
  };
}

export const optionalLocalAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const [record] = await db.select({
      id: localUsersTable.id,
      email: localUsersTable.email,
      role: localUsersTable.role,
    }).from(localSessionsTable)
      .innerJoin(localUsersTable, eq(localSessionsTable.userId, localUsersTable.id))
      .where(and(
        eq(localSessionsTable.tokenHash, hashSessionToken(token)),
        gt(localSessionsTable.expiresAt, new Date()),
        eq(localUsersTable.active, true),
      )).limit(1);
    if (record) req.localUser = { id: record.id, email: record.email, role: record.role };
    next();
  } catch (error) {
    req.log.error({ error }, "Optional local authentication lookup failed");
    res.status(503).json({ error: "No se pudo comprobar la sesión" });
  }
};

export function newLocalUserId(): string {
  return randomUUID();
}