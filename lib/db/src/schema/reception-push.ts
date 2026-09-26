import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receptionPushKeysTable = pgTable("reception_push_keys", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
});

export const receptionPushSubscriptionsTable = pgTable("reception_push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceptionPushSubscriptionSchema = createInsertSchema(receptionPushSubscriptionsTable).omit({ createdAt: true });
export type InsertReceptionPushSubscription = z.infer<typeof insertReceptionPushSubscriptionSchema>;

// A separate opt-in per authorized receptionist; deleting the row revokes delivery.
export const receptionWhatsappAlertsTable = pgTable("reception_whatsapp_alerts", {
  userId: text("user_id").primaryKey(),
  phone: text("phone").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  codeHash: text("code_hash"),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  codeSentAt: timestamp("code_sent_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});