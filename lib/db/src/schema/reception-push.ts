import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
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