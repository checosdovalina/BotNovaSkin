import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, appointmentsTable, servicesTable } from "@workspace/db";
import {
  CreateAppointmentBody,
  CreateAppointmentResponse,
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentResponse,
} from "@workspace/api-zod";
import { serializeAppointment } from "../lib/appointments";

const router: IRouter = Router();
const appointmentTimes = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

function queryValue(value: unknown): string | undefined {
  return Array.isArray(value) ? String(value[0]) : typeof value === "string" ? value : undefined;
}

function appointmentRowCondition(
  date: string,
  time: string,
  excludeId?: number,
) {
  return and(
    eq(appointmentsTable.scheduledDate, date),
    eq(appointmentsTable.scheduledTime, time),
    ne(appointmentsTable.status, "cancelled"),
    excludeId === undefined ? undefined : ne(appointmentsTable.id, excludeId),
  );
}

async function findAppointment(id: number) {
  const [row] = await db
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
    .where(eq(appointmentsTable.id, id));
  return row;
}

router.get("/appointments", async (req, res): Promise<void> => {
  const from = queryValue(req.query.from);
  const to = queryValue(req.query.to);
  const status = queryValue(req.query.status);
  const parsed = ListAppointmentsQueryParams.safeParse({
    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    status,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
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
        from ? gte(appointmentsTable.scheduledDate, from) : undefined,
        to ? lte(appointmentsTable.scheduledDate, to) : undefined,
        status ? eq(appointmentsTable.status, status as typeof appointmentsTable.status.enumValues[number]) : undefined,
      ),
    )
    .orderBy(asc(appointmentsTable.scheduledDate), asc(appointmentsTable.scheduledTime));

  const output = rows.map(serializeAppointment);
  res.json(ListAppointmentsResponse.parse(output).map((appointment) => ({
    ...appointment,
    scheduledDate: appointment.scheduledDate.toISOString().slice(0, 10),
    createdAt: appointment.createdAt.toISOString(),
  })));
});

router.post("/appointments", async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scheduledDate = parsed.data.scheduledDate.toISOString().slice(0, 10);
  const conflict = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(appointmentRowCondition(scheduledDate, parsed.data.scheduledTime))
    .limit(1);
  if (conflict.length > 0) {
    res.status(409).json({ error: "Ese horario ya está ocupado" });
    return;
  }

  const [created] = await db
    .insert(appointmentsTable)
    .values({
      clientName: parsed.data.clientName,
      phone: parsed.data.phone,
      serviceId: parsed.data.serviceId,
      area: parsed.data.area,
      scheduledDate,
      scheduledTime: parsed.data.scheduledTime,
      status: parsed.data.status ?? "pending",
      notes: parsed.data.notes ?? "",
    })
    .returning();
  const row = await findAppointment(created.id);
  res.status(201).json(CreateAppointmentResponse.parse(row));
});

router.patch("/appointments/:id", async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  const body = UpdateAppointmentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const current = await findAppointment(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Cita no encontrada" });
    return;
  }

  const nextDate = body.data.scheduledDate
    ? body.data.scheduledDate.toISOString().slice(0, 10)
    : current.scheduledDate;
  const nextTime = body.data.scheduledTime ?? current.scheduledTime;
  const nextStatus = body.data.status ?? current.status;
  if (nextStatus !== "cancelled") {
    const conflict = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(appointmentRowCondition(nextDate, nextTime, params.data.id))
      .limit(1);
    if (conflict.length > 0) {
      res.status(409).json({ error: "Ese horario ya está ocupado" });
      return;
    }
  }

  await db
    .update(appointmentsTable)
    .set({
      ...body.data,
      scheduledDate: nextDate,
      scheduledTime: nextTime,
    })
    .where(eq(appointmentsTable.id, params.data.id));

  const row = await findAppointment(params.data.id);
  res.json(UpdateAppointmentResponse.parse(row));
});

router.get("/availability", async (req, res): Promise<void> => {
  const date = queryValue(req.query.date);
  const serviceId = queryValue(req.query.serviceId);
  const parsed = GetAvailabilityQueryParams.safeParse({
    date: date ? new Date(`${date}T00:00:00.000Z`) : undefined,
    serviceId,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const dateValue = parsed.data.date.toISOString().slice(0, 10);
  const booked = await db
    .select({ time: appointmentsTable.scheduledTime })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.scheduledDate, dateValue),
        ne(appointmentsTable.status, "cancelled"),
      ),
    );
  const bookedTimes = new Set(booked.map((appointment) => appointment.time));
  res.json(
    GetAvailabilityResponse.parse(
      appointmentTimes.map((time) => ({ time, available: !bookedTimes.has(time) })),
    ),
  );
});

export default router;