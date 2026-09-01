import { integer, pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("beauty_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull().default(0),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  category: text("category").notNull().default("Tratamiento"),
  active: boolean("active").notNull().default(true),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({
  id: true,
});
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;