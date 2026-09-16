import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import {
  appointmentsTable,
  conversationMessagesTable,
  conversationsTable,
  db,
  faqsTable,
  servicesTable,
  type ConversationContext,
  type Conversation,
} from "@workspace/db";
import { answerWithApprovedKnowledge } from "./ai-assistant";

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

const menu = [
  "¡Hola! Soy el asistente de NovaSkin.",
  "",
  "¿En qué puedo ayudarte?",
  "1. Ver tratamientos y precios",
  "2. Agendar una cita",
  "3. Cancelar una cita",
  "4. Reprogramar una cita",
  "5. Hablar con recepción",
].join("\n");

const medicalKeywords = [
  "embaraz",
  "lactancia",
  "medicamento",
  "alerg",
  "reaccion",
  "complicacion",
  "infect",
  "sangrado",
  "dolor fuerte",
  "diagnost",
  "contraindic",
  "efecto adverso",
  "hinchazon",
  "fiebre",
];

const humanKeywords = [
  "persona",
  "humano",
  "recepcion",
  "asesor",
  "doctor",
  "doctora",
  "especialista",
];

const stopWords = new Set([
  "a",
  "al",
  "como",
  "con",
  "cual",
  "de",
  "del",
  "durante",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "para",
  "por",
  "que",
  "se",
  "tratamiento",
  "aplicacion",
  "un",
  "una",
  "y",
]);

export type BotReply = {
  reply: string;
  handoff: boolean;
  state: string;
  conversationId: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:/-]+/gu, " ")
    .trim();
}

function isAppointmentBookingIntent(normalized: string): boolean {
  return (
    normalized === "cita" ||
    normalized.includes("agendar") ||
    normalized.includes("agendo") ||
    normalized.includes("agenda una cita") ||
    normalized.includes("reservar") ||
    normalized.includes("hacer una cita") ||
    normalized.includes("hago una cita") ||
    normalized.includes("sacar una cita") ||
    normalized.includes("saco una cita")
  );
}

function isBusinessHoursIntent(normalized: string): boolean {
  return (
    normalized.includes("horario") ||
    normalized.includes("hora abren") ||
    normalized.includes("hora abre") ||
    normalized.includes("hora cierran") ||
    normalized.includes("hora cierra") ||
    normalized.includes("cuando abren") ||
    normalized.includes("cuando cierran") ||
    normalized.includes("dias abren") ||
    normalized.includes("dias atienden")
  );
}

function isBusinessLocationIntent(normalized: string): boolean {
  return (
    normalized.includes("ubicacion") ||
    normalized.includes("direccion") ||
    normalized.includes("como llego") ||
    normalized.includes("donde estan") ||
    normalized.includes("donde se ubican") ||
    normalized.includes("google maps") ||
    normalized === "mapa"
  );
}

function tokens(value: string): string[] {
  const aliases: Record<string, string> = {
    costo: "precio",
    costos: "precio",
    cuesta: "precio",
    cuestan: "precio",
    dolorosa: "duele",
    doloroso: "duele",
    doler: "duele",
    ven: "notar",
    veo: "notar",
    ver: "notar",
    verse: "notar",
    notan: "notar",
    noto: "notar",
    precios: "precio",
  };
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .map((token) => aliases[token] ?? (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

function currency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayInMexico(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function parseDate(message: string): string | undefined {
  const value = normalize(message);
  const today = todayInMexico();
  if (value.includes("pasado manana")) return addDays(today, 2);
  if (value.includes("manana")) return addDays(today, 1);
  if (value === "hoy" || value.includes(" para hoy")) return today;

  const iso = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const local = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (local) {
    return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  }
  return undefined;
}

function validDate(value: string): boolean {
  const date = new Date(`${value}T12:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= todayInMexico() &&
    date.getUTCDay() !== 0
  );
}

function parseTime(message: string): string | undefined {
  const value = normalize(message);
  const numericChoice = Number(value);
  if (
    Number.isInteger(numericChoice) &&
    numericChoice >= 1 &&
    numericChoice <= appointmentTimes.length
  ) {
    return appointmentTimes[numericChoice - 1];
  }
  const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minutes = match[2] ?? "00";
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  const formatted = `${String(hour).padStart(2, "0")}:${minutes}`;
  return appointmentTimes.includes(formatted) ? formatted : undefined;
}

function isYes(message: string): boolean {
  return /^(si|sí|confirmar|confirmo|correcto|ok|vale)$/.test(
    message.trim().toLowerCase(),
  );
}

function isNo(message: string): boolean {
  return /^(no|cancelar|atras|atrás)$/.test(message.trim().toLowerCase());
}

async function activeServices() {
  return db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.active, true))
    .orderBy(asc(servicesTable.category), asc(servicesTable.name));
}

async function serviceList(): Promise<string> {
  const services = await activeServices();
  if (services.length === 0) {
    return "Por el momento no hay tratamientos activos. Escribe *recepción* para que una persona te ayude.";
  }
  return [
    "Estos son nuestros tratamientos:",
    "",
    ...services.map(
      (service, index) =>
        `${index + 1}. *${service.name}* — ${
          service.price > 0 ? currency(service.price) : "precio por valoración"
        }`,
    ),
    "",
    "Escribe el número o nombre del tratamiento para conocer los detalles o escribe *cita* para agendar.",
  ].join("\n");
}

async function selectService(message: string) {
  const services = await activeServices();
  const choice = Number(normalize(message));
  if (Number.isInteger(choice) && choice >= 1 && choice <= services.length) {
    return services[choice - 1];
  }
  const value = normalize(message);
  return services.find(
    (service) =>
      value.includes(normalize(service.name)) ||
      normalize(service.name).includes(value),
  );
}

async function findFaq(
  message: string,
  serviceHint?: string,
  serviceId?: number,
): Promise<
  | {
      answer: string;
      serviceId?: number;
      serviceName?: string;
    }
  | undefined
> {
  const searchableMessage = serviceHint ? `${message} ${serviceHint}` : message;
  const normalizedMessage = normalize(searchableMessage);
  const definitionIntent = /^que (es|son)\b/.test(normalizedMessage);
  const messageTokens = new Set(tokens(searchableMessage));
  const requiredSubject = ["sesione", "unidade"].find((subject) =>
    messageTokens.has(subject),
  );
  if (messageTokens.size === 0) return undefined;
  const rows = await db
    .select({
      answer: faqsTable.answer,
      question: faqsTable.question,
      priority: faqsTable.priority,
      serviceId: faqsTable.serviceId,
      serviceName: servicesTable.name,
    })
    .from(faqsTable)
    .leftJoin(servicesTable, eq(faqsTable.serviceId, servicesTable.id))
    .where(
      serviceId
        ? and(eq(faqsTable.active, true), eq(faqsTable.serviceId, serviceId))
        : eq(faqsTable.active, true),
    )
    .orderBy(desc(faqsTable.priority));

  let best:
    | {
        answer: string;
        score: number;
        serviceId?: number;
        serviceName?: string;
      }
    | undefined;
  for (const row of rows) {
    const definitionQuestion = /^que (es|son)\b/.test(
      normalize(row.question),
    );
    const questionTokens = tokens(
      `${row.question} ${row.serviceName ?? ""}`,
    );
    if (requiredSubject && !questionTokens.includes(requiredSubject)) {
      continue;
    }
    const answerTokens = tokens(row.answer);
    const questionMatches = new Set(
      questionTokens.filter((token) => messageTokens.has(token)),
    ).size;
    const answerMatches = new Set(
      answerTokens.filter((token) => messageTokens.has(token)),
    ).size;
    const totalMatches = new Set(
      [...questionTokens, ...answerTokens].filter((token) =>
        messageTokens.has(token),
      ),
    ).size;
    const score =
      questionMatches * 3 +
      answerMatches +
      (definitionIntent && definitionQuestion ? 10 : 0);
    if (
      (totalMatches >= 2 ||
        (definitionIntent && definitionQuestion && totalMatches >= 1)) &&
      (!best || score > best.score)
    ) {
      best = {
        answer: row.answer,
        score,
        serviceId: row.serviceId ?? undefined,
        serviceName: row.serviceName ?? undefined,
      };
    }
  }
  return best;
}

async function availableTimes(date: string): Promise<string[]> {
  const rows = await db
    .select({ time: appointmentsTable.scheduledTime })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.scheduledDate, date),
        ne(appointmentsTable.status, "cancelled"),
      ),
    );
  const booked = new Set(rows.map((row) => row.time));
  return appointmentTimes.filter((time) => !booked.has(time));
}

async function upcomingAppointments(phone: string) {
  return db
    .select({
      id: appointmentsTable.id,
      serviceName: servicesTable.name,
      scheduledDate: appointmentsTable.scheduledDate,
      scheduledTime: appointmentsTable.scheduledTime,
    })
    .from(appointmentsTable)
    .innerJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(appointmentsTable.phone, phone),
        gte(appointmentsTable.scheduledDate, todayInMexico()),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    )
    .orderBy(asc(appointmentsTable.scheduledDate), asc(appointmentsTable.scheduledTime));
}

async function getConversation(phone: string): Promise<Conversation> {
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.phone, phone));
  if (existing) return existing;
  const [created] = await db
    .insert(conversationsTable)
    .values({ phone })
    .returning();
  return created;
}

async function updateConversation(
  id: number,
  values: Partial<typeof conversationsTable.$inferInsert>,
): Promise<Conversation> {
  const [updated] = await db
    .update(conversationsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(conversationsTable.id, id))
    .returning();
  return updated;
}

async function transition(
  conversation: Conversation,
  state: Conversation["state"],
  context: ConversationContext,
  reply: string,
  status: Conversation["status"] = conversation.status,
): Promise<BotReply> {
  const updated = await updateConversation(conversation.id, {
    state,
    context,
    status,
    lastMessageAt: new Date(),
  });
  return {
    reply,
    handoff: updated.status === "human",
    state: updated.state,
    conversationId: updated.id,
  };
}

function appointmentsList(
  rows: Array<{
    id: number;
    serviceName: string;
    scheduledDate: string;
    scheduledTime: string;
  }>,
): string {
  return rows
    .map(
      (row, index) =>
        `${index + 1}. ${row.serviceName} — ${row.scheduledDate} a las ${row.scheduledTime}`,
    )
    .join("\n");
}

async function startAppointment(
  conversation: Conversation,
  purpose: "treatment" | "valuation" = "treatment",
): Promise<BotReply> {
  if (
    purpose === "valuation" &&
    conversation.context?.serviceId &&
    conversation.context.serviceName
  ) {
    return transition(
      conversation,
      "await_date",
      {
        serviceId: conversation.context.serviceId,
        serviceName: conversation.context.serviceName,
        appointmentPurpose: "valuation",
      },
      `Claro. Agendaremos una valoración para *${conversation.context.serviceName}*.\n\n¿Qué fecha prefieres? Escribe, por ejemplo, *mañana* o *20/09/2026*. Atendemos de lunes a sábado.`,
      "bot",
    );
  }
  return transition(
    conversation,
    "await_service",
    { appointmentPurpose: purpose },
    purpose === "valuation"
      ? `${await serviceList()}\n\n¿Para qué tratamiento deseas agendar la valoración?`
      : `${await serviceList()}\n\n¿Cuál tratamiento deseas agendar?`,
    "bot",
  );
}

async function startExistingAppointmentFlow(
  conversation: Conversation,
  kind: "cancel" | "reschedule",
): Promise<BotReply> {
  const rows = await upcomingAppointments(conversation.phone);
  if (rows.length === 0) {
    return transition(
      conversation,
      "idle",
      {},
      "No encontré citas próximas asociadas a este número. Escribe *recepción* si necesitas ayuda.",
    );
  }
  if (rows.length === 1) {
    const row = rows[0];
    if (kind === "cancel") {
      return transition(
        conversation,
        "await_cancel_confirm",
        { appointmentId: row.id },
        `Encontré tu cita de *${row.serviceName}* el ${row.scheduledDate} a las ${row.scheduledTime}.\n\n¿Deseas cancelarla? Responde *sí* o *no*.`,
      );
    }
    return transition(
      conversation,
      "await_reschedule_date",
      { appointmentId: row.id },
      `Vamos a reprogramar tu cita de *${row.serviceName}* del ${row.scheduledDate} a las ${row.scheduledTime}.\n\nEscribe la nueva fecha en formato DD/MM/AAAA.`,
    );
  }
  return transition(
    conversation,
    kind === "cancel"
      ? "await_cancel_selection"
      : "await_reschedule_selection",
    {},
    `Encontré estas citas:\n\n${appointmentsList(rows)}\n\nEscribe el número de la cita que deseas ${
      kind === "cancel" ? "cancelar" : "reprogramar"
    }.`,
  );
}

async function processState(
  conversation: Conversation,
  message: string,
): Promise<BotReply | undefined> {
  const context = conversation.context ?? {};
  if (conversation.state === "await_service") {
    const service = await selectService(message);
    if (!service) {
      return transition(
        conversation,
        "await_service",
        context,
        `No identifiqué ese tratamiento.\n\n${await serviceList()}`,
      );
    }
    return transition(
      conversation,
      "await_date",
      { ...context, serviceId: service.id, serviceName: service.name },
      `Perfecto, seleccionaste *${service.name}*${
        context.appointmentPurpose === "valuation"
          ? " para la valoración"
          : ""
      }.\n\n¿Qué fecha prefieres? Escribe, por ejemplo, *mañana* o *20/09/2026*. Atendemos de lunes a sábado.`,
    );
  }

  if (conversation.state === "await_date") {
    const date = parseDate(message);
    if (!date || !validDate(date)) {
      return transition(
        conversation,
        "await_date",
        context,
        "No pude validar esa fecha. Escribe una fecha futura de lunes a sábado en formato DD/MM/AAAA, o escribe *mañana*.",
      );
    }
    const times = await availableTimes(date);
    if (times.length === 0) {
      return transition(
        conversation,
        "await_date",
        context,
        "Ese día ya no tiene horarios disponibles. Por favor elige otra fecha.",
      );
    }
    return transition(
      conversation,
      "await_time",
      { ...context, scheduledDate: date },
      `Horarios disponibles para ${date}:\n\n${times
        .map((time, index) => `${index + 1}. ${time}`)
        .join("\n")}\n\nEscribe el horario, por ejemplo *10:00*.`,
    );
  }

  if (conversation.state === "await_time") {
    const date = context.scheduledDate;
    const times = date ? await availableTimes(date) : [];
    const choice = Number(normalize(message));
    const time =
      Number.isInteger(choice) && choice >= 1 && choice <= times.length
        ? times[choice - 1]
        : parseTime(message);
    if (!time || !date || !times.includes(time)) {
      return transition(
        conversation,
        "await_time",
        context,
        "Ese horario no está disponible. Escribe uno de los horarios mostrados, por ejemplo *10:00*.",
      );
    }
    return transition(
      conversation,
      "await_name",
      { ...context, scheduledTime: time },
      context.appointmentPurpose === "valuation"
        ? "¿A nombre de quién registro la valoración?"
        : "¿A nombre de quién registro la cita?",
    );
  }

  if (conversation.state === "await_name") {
    const name = message.trim();
    if (name.length < 2 || name.length > 100) {
      return transition(
        conversation,
        "await_name",
        context,
        "Escribe el nombre de la persona para registrar la cita.",
      );
    }
    const nextContext = { ...context, clientName: name };
    return transition(
      conversation,
      "await_confirm",
      nextContext,
      [
        "Confirma los datos de tu cita:",
        "",
        `Tipo: *${
          nextContext.appointmentPurpose === "valuation"
            ? "Valoración"
            : "Tratamiento"
        }*`,
        `Tratamiento: *${nextContext.serviceName}*`,
        `Fecha: *${nextContext.scheduledDate}*`,
        `Hora: *${nextContext.scheduledTime}*`,
        `Nombre: *${name}*`,
        "",
        "Responde *sí* para confirmar o *no* para cancelar.",
      ].join("\n"),
    );
  }

  if (conversation.state === "await_confirm") {
    if (isNo(message)) {
      return transition(
        conversation,
        "idle",
        {},
        `No se creó la cita.\n\n${menu}`,
      );
    }
    if (!isYes(message)) {
      return transition(
        conversation,
        "await_confirm",
        context,
        "Responde *sí* para confirmar la cita o *no* para cancelar.",
      );
    }
    if (
      !context.serviceId ||
      !context.scheduledDate ||
      !context.scheduledTime ||
      !context.clientName
    ) {
      return transition(
        conversation,
        "idle",
        {},
        "No pude completar la cita. Escribe *cita* para empezar nuevamente.",
      );
    }
    const conflict = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.scheduledDate, context.scheduledDate),
          eq(appointmentsTable.scheduledTime, context.scheduledTime),
          ne(appointmentsTable.status, "cancelled"),
        ),
      )
      .limit(1);
    if (conflict.length > 0) {
      return transition(
        conversation,
        "await_date",
        {
          serviceId: context.serviceId,
          serviceName: context.serviceName,
          appointmentPurpose: context.appointmentPurpose,
        },
        "Ese horario acaba de ocuparse. Por favor elige otra fecha.",
      );
    }
    await db.insert(appointmentsTable).values({
      clientName: context.clientName,
      phone: conversation.phone,
      serviceId: context.serviceId,
      area: "WhatsApp",
      scheduledDate: context.scheduledDate,
      scheduledTime: context.scheduledTime,
      status: "confirmed",
      notes:
        context.appointmentPurpose === "valuation"
          ? "Valoración creada automáticamente por el bot de WhatsApp."
          : "Cita de tratamiento creada automáticamente por el bot de WhatsApp.",
    });
    return transition(
      conversation,
      "idle",
      {},
      `Tu ${
        context.appointmentPurpose === "valuation" ? "valoración" : "cita"
      } quedó confirmada para *${context.scheduledDate} a las ${context.scheduledTime}*.\n\nSi necesitas cambiarla, escribe *reprogramar*.`,
    );
  }

  if (
    conversation.state === "await_cancel_selection" ||
    conversation.state === "await_reschedule_selection"
  ) {
    const rows = await upcomingAppointments(conversation.phone);
    const choice = Number(normalize(message));
    const selected =
      Number.isInteger(choice) && choice >= 1 && choice <= rows.length
        ? rows[choice - 1]
        : undefined;
    if (!selected) {
      return transition(
        conversation,
        conversation.state,
        context,
        `Selecciona una cita escribiendo su número:\n\n${appointmentsList(rows)}`,
      );
    }
    if (conversation.state === "await_cancel_selection") {
      return transition(
        conversation,
        "await_cancel_confirm",
        { appointmentId: selected.id },
        `¿Confirmas que deseas cancelar la cita de *${selected.serviceName}* del ${selected.scheduledDate} a las ${selected.scheduledTime}? Responde *sí* o *no*.`,
      );
    }
    return transition(
      conversation,
      "await_reschedule_date",
      { appointmentId: selected.id },
      "Escribe la nueva fecha en formato DD/MM/AAAA.",
    );
  }

  if (conversation.state === "await_cancel_confirm") {
    if (isNo(message)) {
      return transition(conversation, "idle", {}, `No se canceló la cita.\n\n${menu}`);
    }
    if (!isYes(message) || !context.appointmentId) {
      return transition(
        conversation,
        "await_cancel_confirm",
        context,
        "Responde *sí* para cancelar la cita o *no* para conservarla.",
      );
    }
    await db
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(appointmentsTable.id, context.appointmentId),
          eq(appointmentsTable.phone, conversation.phone),
        ),
      );
    return transition(
      conversation,
      "idle",
      {},
      "Tu cita fue cancelada. Si quieres agendar una nueva, escribe *cita*.",
    );
  }

  if (conversation.state === "await_reschedule_date") {
    const date = parseDate(message);
    if (!date || !validDate(date)) {
      return transition(
        conversation,
        "await_reschedule_date",
        context,
        "Escribe una fecha futura de lunes a sábado en formato DD/MM/AAAA.",
      );
    }
    const times = await availableTimes(date);
    if (times.length === 0) {
      return transition(
        conversation,
        "await_reschedule_date",
        context,
        "No hay horarios disponibles ese día. Elige otra fecha.",
      );
    }
    return transition(
      conversation,
      "await_reschedule_time",
      { ...context, scheduledDate: date },
      `Horarios disponibles:\n\n${times
        .map((time, index) => `${index + 1}. ${time}`)
        .join("\n")}\n\nEscribe el nuevo horario.`,
    );
  }

  if (conversation.state === "await_reschedule_time") {
    const date = context.scheduledDate;
    const times = date ? await availableTimes(date) : [];
    const choice = Number(normalize(message));
    const time =
      Number.isInteger(choice) && choice >= 1 && choice <= times.length
        ? times[choice - 1]
        : parseTime(message);
    if (
      !time ||
      !date ||
      !context.appointmentId ||
      !times.includes(time)
    ) {
      return transition(
        conversation,
        "await_reschedule_time",
        context,
        "Ese horario no está disponible. Escribe uno de los horarios mostrados.",
      );
    }
    await db
      .update(appointmentsTable)
      .set({ scheduledDate: date, scheduledTime: time, status: "confirmed" })
      .where(
        and(
          eq(appointmentsTable.id, context.appointmentId),
          eq(appointmentsTable.phone, conversation.phone),
        ),
      );
    return transition(
      conversation,
      "idle",
      {},
      `Tu cita fue reprogramada para *${date} a las ${time}*.`,
    );
  }

  return undefined;
}

export async function processConversationMessage(input: {
  phone: string;
  message: string;
  providerMessageId?: string;
  clientName?: string;
}): Promise<BotReply> {
  let conversation = await getConversation(input.phone);

  if (input.providerMessageId) {
    const [duplicate] = await db
      .select({ id: conversationMessagesTable.id })
      .from(conversationMessagesTable)
      .where(
        eq(
          conversationMessagesTable.providerMessageId,
          input.providerMessageId,
        ),
      );
    if (duplicate) {
      return {
        reply: "",
        handoff: conversation.status === "human",
        state: conversation.state,
        conversationId: conversation.id,
      };
    }
  }

  await db.insert(conversationMessagesTable).values({
    conversationId: conversation.id,
    providerMessageId: input.providerMessageId,
    direction: "inbound",
    body: input.message,
    status: "received",
  });

  conversation = await updateConversation(conversation.id, {
    clientName: input.clientName ?? conversation.clientName,
    lastMessage: input.message,
    lastMessageAt: new Date(),
  });

  const normalized = normalize(input.message);
  let result: BotReply;

  if (/^(menu|inicio|hola|buenas|buen dia|buenas tardes|buenas noches)$/.test(normalized)) {
    result = await transition(conversation, "idle", {}, menu, "bot");
  } else if (/^(salir|reiniciar|empezar de nuevo)$/.test(normalized)) {
    result = await transition(conversation, "idle", {}, menu, "bot");
  } else if (medicalKeywords.some((keyword) => normalized.includes(keyword))) {
    result = await transition(
      conversation,
      "idle",
      {},
      "Para cuidar tu seguridad, una pregunta sobre embarazo, medicamentos, síntomas, reacciones o complicaciones debe revisarla un profesional. Ya derivé tu conversación a recepción. Si presentas una urgencia, busca atención médica inmediata.",
      "human",
    );
  } else if (
    normalized === "5" ||
    humanKeywords.some((keyword) => normalized.includes(keyword))
  ) {
    result = await transition(
      conversation,
      "idle",
      {},
      "Ya derivé tu conversación a recepción. Una persona continuará la atención en cuanto esté disponible.",
      "human",
    );
  } else if (conversation.status === "human") {
    result = await transition(
      conversation,
      "idle",
      conversation.context ?? {},
      "Tu conversación sigue asignada a recepción. Si deseas volver al menú automático, escribe *inicio*.",
      "human",
    );
  } else {
    const stateResult = await processState(conversation, input.message);
    if (stateResult) {
      result = stateResult;
    } else {
      const valuationPriceIntent =
        normalized.includes("valoracion") &&
        (normalized.includes("precio") ||
          normalized.includes("costo") ||
          normalized.includes("cuesta") ||
          normalized.includes("cuanto sale"));
      const catalogIntent =
        normalized === "1" ||
        /^(tratamiento|tratamientos|servicio|servicios)$/.test(normalized) ||
        normalized.includes("ver tratamientos") ||
        normalized.includes("que tratamientos") ||
        normalized.includes("lista de tratamientos") ||
        normalized.includes("que servicios") ||
        normalized.includes("lista de servicios");
      const businessHoursIntent = isBusinessHoursIntent(normalized);
      const businessLocationIntent = isBusinessLocationIntent(normalized);
      const actionIntent =
        valuationPriceIntent ||
        catalogIntent ||
        businessHoursIntent ||
        businessLocationIntent ||
        normalized === "2" ||
        normalized === "3" ||
        normalized === "4" ||
        isAppointmentBookingIntent(normalized) ||
        normalized.includes("cancelar cita") ||
        normalized.includes("cancelar mi cita") ||
        normalized.includes("reprogram") ||
        normalized.includes("cambiar cita");
      const sessionIntent = tokens(input.message).includes("sesione");
      const faq = actionIntent
        ? undefined
        : await findFaq(
            input.message,
            conversation.context?.serviceName,
            conversation.context?.serviceId,
          );
      const unsupportedSessionIntent =
        sessionIntent &&
        Boolean(conversation.context?.serviceName) &&
        !faq;
      const ai = actionIntent || unsupportedSessionIntent
        ? { kind: "unavailable" as const }
        : await answerWithApprovedKnowledge({
            conversationId: conversation.id,
            message: input.message,
            serviceId: conversation.context?.serviceId,
            serviceName: conversation.context?.serviceName,
          });
      if (ai.kind === "answer") {
        result = await transition(
          conversation,
          "idle",
          ai.serviceId
            ? {
                serviceId: ai.serviceId,
                serviceName: ai.serviceName,
              }
            : conversation.context ?? {},
          `${ai.answer}\n\nEsta información es general y no sustituye una valoración profesional.`,
        );
      } else if (ai.kind === "handoff") {
        result = await transition(
          conversation,
          "idle",
          conversation.context ?? {},
          "No tengo información aprobada suficiente para responderte correctamente. Ya canalicé tu conversación con recepción para que una persona te ayude.",
          "human",
        );
      } else if (faq) {
        result = await transition(
          conversation,
          "idle",
          faq.serviceId
            ? {
                serviceId: faq.serviceId,
                serviceName: faq.serviceName,
              }
            : conversation.context ?? {},
          `${faq.answer}\n\nEsta información es general y no sustituye una valoración profesional.`,
        );
      } else if (valuationPriceIntent) {
        result = await transition(
          conversation,
          "idle",
          conversation.context ?? {},
          "El costo de la valoración debe confirmarlo recepción, ya que puede depender del tratamiento o especialista. Ya derivé tu conversación para que te compartan el precio vigente.",
          "human",
        );
      } else if (businessHoursIntent) {
        result = await transition(
          conversation,
          "idle",
          conversation.context ?? {},
          [
            "*Horario de atención de NovaSkin:*",
            "Lunes a viernes: 10:00 a. m. a 7:00 p. m.",
            "Sábados: 10:00 a. m. a 4:00 p. m.",
            "Domingos: cerrado.",
            "",
            "Si deseas reservar, escribe *cita*.",
          ].join("\n"),
        );
      } else if (businessLocationIntent) {
        result = await transition(
          conversation,
          "idle",
          conversation.context ?? {},
          [
            "*Ubicación de NovaSkin:*",
            "Plaza Laguna Oriente, Av. Juarez Loc 43, Residencial las Torres Sector II, 27085 Torreón, Coah.",
            "",
            "Abrir ruta en Google Maps:",
            "https://www.google.com/maps/dir/?api=1&destination=Plaza+Laguna+Oriente%2C+Av.+Juarez+Loc+43%2C+Residencial+las+Torres+Sector+II%2C+27085+Torreon%2C+Coahuila",
          ].join("\n"),
        );
      } else if (unsupportedSessionIntent) {
        result = await transition(
          conversation,
          "idle",
          conversation.context,
          `No tengo un número de sesiones aprobado para *${conversation.context.serviceName}*. Ese dato debe definirse durante la valoración. Si deseas, puedo ayudarte a *agendar una valoración*.`,
        );
      } else if (
      catalogIntent ||
      normalized.includes("precio") ||
      normalized.includes("cuanto cuesta") ||
      normalized.includes("servicio")
      ) {
        const selected = catalogIntent
          ? undefined
          : await selectService(input.message);
        result = await transition(
          conversation,
          "idle",
          selected
            ? { serviceId: selected.id, serviceName: selected.name }
            : {},
          selected
            ? `*${selected.name}*\n${selected.description}\nDuración aproximada: ${selected.durationMinutes} minutos.\nPrecio: ${
                selected.price > 0
                  ? currency(selected.price)
                  : "se confirma en valoración"
              }.\n\nEscribe *cita* si deseas agendar.`
            : await serviceList(),
        );
      } else if (
        normalized === "2" ||
        isAppointmentBookingIntent(normalized)
      ) {
        result = await startAppointment(
          conversation,
          normalized.includes("valoracion") ? "valuation" : "treatment",
        );
      } else if (
        normalized === "3" ||
        normalized.includes("cancelar cita") ||
        normalized.includes("cancelar mi cita")
      ) {
        result = await startExistingAppointmentFlow(conversation, "cancel");
      } else if (
        normalized === "4" ||
        normalized.includes("reprogram") ||
        normalized.includes("cambiar cita")
      ) {
        result = await startExistingAppointmentFlow(conversation, "reschedule");
      } else {
        const selected = await selectService(input.message);
        if (selected) {
          result = await transition(
            conversation,
            "idle",
            { serviceId: selected.id, serviceName: selected.name },
            `*${selected.name}*\n${selected.description}\nDuración aproximada: ${selected.durationMinutes} minutos.\nPrecio: ${
              selected.price > 0
                ? currency(selected.price)
                : "se confirma en valoración"
            }.\n\nEscribe *cita* si deseas agendar.`,
          );
        } else if (ai.kind === "no_knowledge") {
          result = await transition(
            conversation,
            "idle",
            conversation.context ?? {},
            "No tengo información aprobada suficiente para responderte correctamente. Ya canalicé tu conversación con recepción para que una persona te ayude.",
            "human",
          );
        } else {
          result = await transition(
            conversation,
            "idle",
            {},
            `No encontré una respuesta exacta. Puedes escribir *tratamientos*, *cita*, *cancelar*, *reprogramar* o *recepción*.\n\n${menu}`,
          );
        }
      }
    }
  }

  if (result.reply) {
    await db.insert(conversationMessagesTable).values({
      conversationId: result.conversationId,
      direction: "outbound",
      body: result.reply,
      status: "generated",
    });
  }
  return result;
}

export async function resetConversation(phone: string): Promise<void> {
  const [conversation] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.phone, phone));
  if (!conversation) return;
  await db
    .update(conversationsTable)
    .set({ state: "idle", status: "bot", context: {}, updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));
}

export async function listConversations(status?: string) {
  return db
    .select({
      id: conversationsTable.id,
      phone: conversationsTable.phone,
      clientName: conversationsTable.clientName,
      status: conversationsTable.status,
      state: conversationsTable.state,
      lastMessage: conversationsTable.lastMessage,
      lastMessageAt: conversationsTable.lastMessageAt,
      messageCount: sql<number>`count(${conversationMessagesTable.id})::int`,
    })
    .from(conversationsTable)
    .leftJoin(
      conversationMessagesTable,
      eq(conversationsTable.id, conversationMessagesTable.conversationId),
    )
    .where(
      status && ["bot", "human", "closed"].includes(status)
        ? eq(
            conversationsTable.status,
            status as (typeof conversationsTable.status.enumValues)[number],
          )
        : undefined,
    )
    .groupBy(conversationsTable.id)
    .orderBy(desc(conversationsTable.lastMessageAt));
}

export async function setConversationStatus(
  id: number,
  status: "bot" | "human" | "closed",
) {
  const [updated] = await db
    .update(conversationsTable)
    .set({
      status,
      state: status === "bot" ? "idle" : undefined,
      context: status === "bot" ? {} : undefined,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, id))
    .returning();
  return updated;
}