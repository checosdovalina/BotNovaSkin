import { db, receptionPushKeysTable, receptionPushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { logger } from "./logger";
import { clerkClient } from "@clerk/express";

// The same key pair must survive restarts and be shared across server instances.
export async function getPushKeys() {
  const [existing] = await db.select().from(receptionPushKeysTable).where(eq(receptionPushKeysTable.id, "reception"));
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  await db.insert(receptionPushKeysTable).values({
    id: "reception", publicKey: keys.publicKey, privateKey: keys.privateKey,
  }).onConflictDoNothing();
  const [stored] = await db.select().from(receptionPushKeysTable).where(eq(receptionPushKeysTable.id, "reception"));
  if (!stored) throw new Error("Push keys could not be initialized");
  return stored;
}

export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (/^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|.*\.notify\.windows\.com|.*\.push\.apple\.com)$/i.test(url.hostname));
  } catch {
    return false;
  }
}

function pushSubject() {
  // Production's VPS has a public HTTPS origin even without Replit variables.
  // An explicit subject allows the domain to change without rotating VAPID keys.
  const subject = process.env.VAPID_SUBJECT ??
    (process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
      : "https://apineoskin.nexxo.com.mx");
  if (subject.startsWith("mailto:") && /^mailto:[^@\s]+@[^@\s]+$/.test(subject)) return subject;
  try {
    const url = new URL(subject);
    if (url.protocol === "https:" && url.hostname && !url.username && !url.password) return subject;
  } catch {
    // Invalid subjects fail explicitly instead of silently disabling delivery.
  }
  throw new Error("VAPID_SUBJECT must be a public HTTPS URL or mailto address");
}

export async function notifyReceptionOfHandoff() {
  try {
    const subscriptions = await db.select().from(receptionPushSubscriptionsTable);
    if (!subscriptions.length) return;
    const allowed = (process.env.RECEPTION_ALLOWED_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return;
    const authorized = new Set<string>();
    await Promise.all([...new Set(subscriptions.map((subscription) => subscription.userId))].map(async (userId) => {
      try {
        const user = await clerkClient.users.getUser(userId);
        const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
        if (primary?.verification?.status === "verified" && allowed.includes(primary.emailAddress.toLowerCase())) authorized.add(userId);
      } catch {
        // Fail closed when authorization cannot be checked.
        logger.warn("Could not verify reception push recipient");
      }
    }));
    const recipients = subscriptions.filter((subscription) => authorized.has(subscription.userId));
    if (!recipients.length) return;
    const keys = await getPushKeys();
    webpush.setVapidDetails(pushSubject(), keys.publicKey, keys.privateKey);
    // No client identifier, message, phone number or conversation ID leaves the server.
    const payload = JSON.stringify({ title: "Nueva solicitud para recepción", body: "Abre la bandeja protegida para atenderla." });
    await Promise.all(recipients.map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 3600 });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(receptionPushSubscriptionsTable).where(eq(receptionPushSubscriptionsTable.endpoint, subscription.endpoint));
        } else {
          logger.warn({ status }, "Reception push delivery failed");
        }
      }
    }));
  } catch (error) {
    logger.warn({ error }, "Reception push notification failed");
  }
}