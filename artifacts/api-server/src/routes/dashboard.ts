import { and, asc, count, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, appointmentsTable, faqsTable, servicesTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const currentDate = today();
  const [{ value: serviceCount }] = await db
    .select({ value: count() })
    .from(servicesTable)
    .where(eq(servicesTable.active, true));
  const [{ value: faqCount }] = await db.select({ value: count() }).from(faqsTable);
  const [{ value: todayAppointments }] = await db
    .select({ value: count() })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.scheduledDate, currentDate),
        eq(appointmentsTable.status, "confirmed"),
      ),
    );
  const [{ value: upcomingAppointments }] = await db
    .select({ value: count() })
    .from(appointmentsTable)
    .where(
      and(
        gte(appointmentsTable.scheduledDate, currentDate),
        eq(appointmentsTable.status, "confirmed"),
      ),
    );

  const [next] = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phone: appointmentsTable.phone,
      serviceId: appointmentsTable.serviceId,
      serviceName: servicesTable.name,
      area: appointmentsTable.area,
      scheduledDate: appointmentsTable.scheduledDate,
      scheduledTime: appointmentsTable.scheduledTime,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      createdAt: appointmentsTable.createdAt,
    })
    .from(appointmentsTable)
    .innerJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(
      and(
        gte(appointmentsTable.scheduledDate, currentDate),
        eq(appointmentsTable.status, "confirmed"),
      ),
    )
    .orderBy(asc(appointmentsTable.scheduledDate), asc(appointmentsTable.scheduledTime))
    .limit(1);

  const response = {
    businessName: "PruebaEstetica",
    todayAppointments: Number(todayAppointments),
    upcomingAppointments: Number(upcomingAppointments),
    activeServices: Number(serviceCount),
    faqCount: Number(faqCount),
    botConnected: false,
    nextAppointment: next
      ? {
          ...next,
          scheduledDate: new Date(`${next.scheduledDate}T00:00:00.000Z`),
          createdAt: next.createdAt,
        }
      : null,
  };
  res.json(GetDashboardResponse.parse(response));
});

export default router;