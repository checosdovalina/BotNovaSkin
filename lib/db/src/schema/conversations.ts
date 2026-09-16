import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationStatusValues = ["bot", "human", "closed"] as const;
export const conversationStateValues = [
  "idle",
  "await_service",
  "await_date",
  "await_time",
  "await_name",
  "await_confirm",
  "await_cancel_selection",
  "await_cancel_confirm",
  "await_reschedule_selection",
  "await_reschedule_date",
  "await_reschedule_time",
] as const;

export type ConversationContext = {
  serviceId?: number;
  serviceName?: string;
  appointmentPurpose?: "treatment" | "valuation";
  scheduledDate?: string;
  scheduledTime?: string;
  clientName?: string;
  appointmentId?: number;
};

export const conversationsTable = pgTable(
  "beauty_conversations",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    clientName: text("client_name"),
    status: text("status", { enum: conversationStatusValues })
      .notNull()
      .default("bot"),
    state: text("state", { enum: conversationStateValues })
      .notNull()
      .default("idle"),
    context: jsonb("context").$type<ConversationContext>().notNull().default({}),
    lastMessage: text("last_message").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("beauty_conversations_phone_idx").on(table.phone)],
);

export const messageDirectionValues = ["inbound", "outbound"] as const;

export const conversationMessagesTable = pgTable(
  "beauty_conversation_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id),
    providerMessageId: text("provider_message_id"),
    direction: text("direction", { enum: messageDirectionValues }).notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("beauty_messages_provider_id_idx").on(table.providerMessageId),
  ],
);

export const insertConversationSchema = createInsertSchema(
  conversationsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertConversationMessageSchema = createInsertSchema(
  conversationMessagesTable,
).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMessage =
  typeof conversationMessagesTable.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertConversationMessage = z.infer<
  typeof insertConversationMessageSchema
>;