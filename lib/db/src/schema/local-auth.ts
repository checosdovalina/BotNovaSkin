import { createInsertSchema } from "drizzle-zod";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const localUsersTable = pgTable("local_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["staff", "admin", "superadmin"] }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("local_users_email_unique").on(table.email)]);

export const localSessionsTable = pgTable("local_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => localUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocalUserSchema = createInsertSchema(localUsersTable).omit({ createdAt: true, updatedAt: true });
export type InsertLocalUser = z.infer<typeof insertLocalUserSchema>;
export type LocalUser = typeof localUsersTable.$inferSelect;
export type LocalSession = typeof localSessionsTable.$inferSelect;