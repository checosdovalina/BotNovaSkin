import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { servicesTable } from "./services";

export const faqsTable = pgTable("beauty_faqs", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").references(() => servicesTable.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertFaqSchema = createInsertSchema(faqsTable).omit({
  id: true,
});
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqsTable.$inferSelect;