import { db, receptionPushKeysTable, receptionPushSubscriptionsTable, receptionWhatsappAlertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { logger } from "./logger";
import { clerkClient } from "@clerk/express";
import { sendWhatsAppTemplate, whatsappConfigured } from "./whatsapp";

function receptionInboxUrl() {
  try {
    const url = new URL(process.env.RECEPTION_INBOX_URL ?? "");
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/conversations") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function alternateAlertsAvailable() {
  return whatsappConfigured() && Boolean(process.env.RECEPTION_WHATSAPP_TEMPLATE) && Boolean(receptionInboxUrl());
}

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
    const [subscriptions, alternateRecipients] = await Promise.all([
      db.select().from(receptionPushSubscriptionsTable),
      alternateAlertsAvailable() ? db.select().from(receptionWhatsappAlertsTable) :
        Promise.resolve([] as (typeof receptionWhatsappAlertsTable.$inferSelect)[]),
    ]);
    if (!subscriptions.length && !alternateRecipients.length) return;
    const allowed = (process.env.RECEPTION_ALLOWED_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return;
    const authorized = new Set<string>();
    await Promise.all([...new Set([...subscriptions, ...alternateRecipients].map((recipient) => recipient.userId))].map(async (userId) => {
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
    const pushDelivery = (async () => {
      if (!recipients.length) return;
      try {
        const keys = await getPushKeys();
        webpush.setVapidDetails(pushSubject(), keys.publicKey, keys.privateKey);
        // No client identifier, message, phone number or conversation ID leaves the server.
        const payload = JSON.stringify({ title: "Nueva solicitud para recepción", body: "Abre la bandeja protegida para atenderla." });
        await Promise.all(recipients.map(async (subscription) => {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload, { TTL: 3600, timeout: 10_000 });
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
    })();
    const alternateDelivery = (async () => {
      const inbox = receptionInboxUrl();
      if (!inbox || !alternateAlertsAvailable()) return;
      await Promise.all(alternateRecipients.filter((recipient) => authorized.has(recipient.userId)).map(async (recipient) => {
        try {
          // The approved template contains only a generic notice and the inbox URL; Meta requires text after {{1}}.
          await sendWhatsAppTemplate(recipient.phone, process.env.RECEPTION_WHATSAPP_TEMPLATE!, "es_MX", [inbox]);
        } catch (error) {
          logger.warn({ error }, "Reception WhatsApp alert failed");
        }
      }));
    })();
    await Promise.all([pushDelivery, alternateDelivery]);
  } catch (error) {
    logger.warn({ error }, "Reception push notification failed");
  }
}