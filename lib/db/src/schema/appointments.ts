import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { servicesTable } from "./services";

export const appointmentStatusValues = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;

export const appointmentsTable = pgTable("beauty_appointments", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  phone: text("phone").notNull(),
  serviceId: integer("service_id")
    .notNull()
    .references(() => servicesTable.id),
  area: text("area").notNull().default("Por definir"),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status", { enum: appointmentStatusValues })
    .notNull()
    .default("pending"),
  notes: text("notes").notNull().default(""),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  reminder24SentAt: timestamp("reminder_24_sent_at", { withTimezone: true }),
  reminder2SentAt: timestamp("reminder_2_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(
  appointmentsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;