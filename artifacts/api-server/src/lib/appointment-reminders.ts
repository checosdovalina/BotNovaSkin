import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  servicesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  sendWhatsAppTemplate,
  whatsappConfigured,
  whatsappReminderTemplatesConfigured,
} from "./whatsapp";

const clinicTimeZone = "America/Monterrey";
const pollIntervalMs = 60_000;
let processing = false;

function appointmentInstant() {
  return sql`((${appointmentsTable.scheduledDate}::date + ${appointmentsTable.scheduledTime}::time) AT TIME ZONE ${clinicTimeZone})`;
}

async function processReminder(
  kind: "24h" | "2h",
  templateName: string,
): Promise<void> {
  const instant = appointmentInstant();
  const sentColumn =
    kind === "24h"
      ? appointmentsTable.reminder24SentAt
      : appointmentsTable.reminder2SentAt;
  const dueInterval = kind === "24h" ? "24 hours" : "2 hours";
  const rows = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phone: appointmentsTable.phone,
      scheduledDate: appointmentsTable.scheduledDate,
      scheduledTime: appointmentsTable.scheduledTime,
      serviceName: servicesTable.name,
    })
    .from(appointmentsTable)
    .innerJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(appointmentsTable.status, "confirmed"),
        isNotNull(appointmentsTable.phoneVerifiedAt),
        isNull(sentColumn),
        gt(instant, sql`now()`),
        lte(instant, sql`now() + ${dueInterval}::interval`),
        kind === "24h"
          ? gt(instant, sql`now() + interval '2 hours'`)
          : undefined,
      ),
    )
    .limit(25);

  for (const row of rows) {
    try {
      await sendWhatsAppTemplate(row.phone, templateName, [
        row.clientName,
        row.serviceName,
        row.scheduledDate,
        row.scheduledTime,
      ]);
      await db
        .update(appointmentsTable)
        .set(
          kind === "24h"
            ? { reminder24SentAt: new Date() }
            : { reminder2SentAt: new Date() },
        )
        .where(and(eq(appointmentsTable.id, row.id), isNull(sentColumn)));
      logger.info({ appointmentId: row.id, kind }, "Appointment reminder sent");
    } catch (err) {
      logger.error(
        { err, appointmentId: row.id, kind },
        "Appointment reminder failed",
      );
    }
  }
}

async function processDueReminders(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    await processReminder(
      "24h",
      process.env.WHATSAPP_REMINDER_24H_TEMPLATE!,
    );
    await processReminder("2h", process.env.WHATSAPP_REMINDER_2H_TEMPLATE!);
  } finally {
    processing = false;
  }
}

export function startAppointmentReminderWorker(): void {
  if (!whatsappConfigured() || !whatsappReminderTemplatesConfigured()) {
    logger.warn(
      "Appointment reminders disabled until WhatsApp reminder templates are configured",
    );
    return;
  }
  void processDueReminders();
  const timer = setInterval(() => void processDueReminders(), pollIntervalMs);
  timer.unref();
  logger.info({ clinicTimeZone }, "Appointment reminder worker started");
}