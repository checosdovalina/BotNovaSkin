import { and, desc, eq } from "drizzle-orm";
import {
  conversationMessagesTable,
  db,
  faqsTable,
  servicesTable,
} from "@workspace/db";
import { logger } from "./logger";

type AiResult =
  | {
      kind: "answer";
      answer: string;
      serviceId?: number;
      serviceName?: string;
    }
  | { kind: "handoff" }
  | { kind: "no_knowledge" }
  | { kind: "unavailable" };

type KnowledgeRow = {
  id: number;
  question: string;
  answer: string;
  serviceId: number | null;
  serviceName: string | null;
};

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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function configured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && !key.includes("REEMPLAZAR"));
}

async function knowledgeFor(
  message: string,
  serviceId?: number,
): Promise<KnowledgeRow[]> {
  const rows = await db
    .select({
      id: faqsTable.id,
      question: faqsTable.question,
      answer: faqsTable.answer,
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

  if (serviceId) return rows.slice(0, 40);

  const messageTokens = tokens(message);
  return rows
    .map((row) => {
      const rowTokens = tokens(
        `${row.question} ${row.answer} ${row.serviceName ?? ""}`,
      );
      const score = [...messageTokens].filter((token) =>
        rowTokens.has(token),
      ).length;
      return { row, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map(({ row }) => row);
}

async function recentHistory(conversationId: number) {
  const rows = await db
    .select({
      direction: conversationMessagesTable.direction,
      body: conversationMessagesTable.body,
    })
    .from(conversationMessagesTable)
    .where(eq(conversationMessagesTable.conversationId, conversationId))
    .orderBy(desc(conversationMessagesTable.createdAt))
    .limit(8);

  return rows.reverse().map((row) => ({
    role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: row.body,
  }));
}

export function aiConfigured(): boolean {
  return configured();
}

export async function answerWithApprovedKnowledge(input: {
  conversationId: number;
  message: string;
  serviceId?: number;
  serviceName?: string;
}): Promise<AiResult> {
  if (!configured()) return { kind: "unavailable" };

  const knowledge = await knowledgeFor(input.message, input.serviceId);
  if (knowledge.length === 0) return { kind: "no_knowledge" };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { kind: "unavailable" };

  const allowedIds = new Set(knowledge.map((row) => row.id));
  const knowledgeText = knowledge
    .map(
      (row) =>
        `[FAQ ${row.id}] Tratamiento: ${row.serviceName ?? "General"}\nPregunta: ${row.question}\nRespuesta aprobada: ${row.answer}`,
    )
    .join("\n\n");
  const history = await recentHistory(input.conversationId);
  const baseUrl = (
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Eres el asistente de atención de NovaSkin.",
              "Responde en español, de forma breve, amable y natural.",
              "Solo puedes afirmar información contenida en las FAQs aprobadas incluidas abajo.",
              "Usa el historial para entender preguntas de seguimiento.",
              "No diagnostiques, no decidas elegibilidad clínica, no inventes precios ni des indicaciones médicas.",
              'Devuelve JSON con esta forma exacta: {"canAnswer":true|false,"answer":"texto","sourceIds":[1,2]}.',
              "Si la información aprobada no responde la pregunta, usa canAnswer=false, answer vacío y sourceIds vacío.",
              "Si respondes, incluye al menos un ID de FAQ que respalde directamente la respuesta.",
              "",
              "INFORMACIÓN APROBADA:",
              knowledgeText,
            ].join("\n"),
          },
          ...history,
        ],
      }),
      signal: AbortSignal.timeout(
        Number(process.env.OPENAI_TIMEOUT_MS ?? "12000"),
      ),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "OpenAI request failed; using deterministic fallback",
      );
      return { kind: "unavailable" };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { kind: "unavailable" };

    const parsed = JSON.parse(content) as {
      canAnswer?: boolean;
      answer?: string;
      sourceIds?: number[];
    };
    const validSources = (parsed.sourceIds ?? []).filter((id) =>
      allowedIds.has(id),
    );
    if (
      !parsed.canAnswer ||
      !parsed.answer?.trim() ||
      validSources.length === 0
    ) {
      return { kind: "handoff" };
    }

    const source = knowledge.find((row) => row.id === validSources[0]);
    return {
      kind: "answer",
      answer: parsed.answer.trim(),
      serviceId: source?.serviceId ?? input.serviceId,
      serviceName: source?.serviceName ?? input.serviceName,
    };
  } catch (error) {
    logger.warn(
      { err: error },
      "OpenAI request errored; using deterministic fallback",
    );
    return { kind: "unavailable" };
  }
}