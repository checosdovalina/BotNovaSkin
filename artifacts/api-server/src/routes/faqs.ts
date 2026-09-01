import { asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, faqsTable, servicesTable } from "@workspace/db";
import {
  CreateFaqBody,
  CreateFaqResponse,
  DeleteFaqParams,
  ListFaqsQueryParams,
  ListFaqsResponse,
  UpdateFaqBody,
  UpdateFaqParams,
  UpdateFaqResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function withServiceName(row: {
  id: number;
  serviceId: number | null;
  question: string;
  answer: string;
  priority: number;
  active: boolean;
  serviceName: string | null;
}) {
  return row;
}

router.get("/faqs", async (req, res): Promise<void> => {
  const rawServiceId = Array.isArray(req.query.serviceId)
    ? req.query.serviceId[0]
    : req.query.serviceId;
  const query = ListFaqsQueryParams.safeParse({
    serviceId: rawServiceId === undefined ? undefined : Number(rawServiceId),
  });
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = await db
    .select({
      id: faqsTable.id,
      serviceId: faqsTable.serviceId,
      question: faqsTable.question,
      answer: faqsTable.answer,
      priority: faqsTable.priority,
      active: faqsTable.active,
      serviceName: servicesTable.name,
    })
    .from(faqsTable)
    .leftJoin(servicesTable, eq(faqsTable.serviceId, servicesTable.id))
    .where(
      query.data.serviceId === undefined
        ? undefined
        : eq(faqsTable.serviceId, query.data.serviceId),
    )
    .orderBy(asc(faqsTable.priority), asc(faqsTable.id));

  res.json(ListFaqsResponse.parse(rows.map(withServiceName)));
});

router.post("/faqs", async (req, res): Promise<void> => {
  const parsed = CreateFaqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [faq] = await db.insert(faqsTable).values(parsed.data).returning();
  const [row] = await db
    .select({
      id: faqsTable.id,
      serviceId: faqsTable.serviceId,
      question: faqsTable.question,
      answer: faqsTable.answer,
      priority: faqsTable.priority,
      active: faqsTable.active,
      serviceName: servicesTable.name,
    })
    .from(faqsTable)
    .leftJoin(servicesTable, eq(faqsTable.serviceId, servicesTable.id))
    .where(eq(faqsTable.id, faq.id));
  res.status(201).json(CreateFaqResponse.parse(row));
});

router.patch("/faqs/:id", async (req, res): Promise<void> => {
  const params = UpdateFaqParams.safeParse(req.params);
  const body = UpdateFaqBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [faq] = await db
    .update(faqsTable)
    .set(body.data)
    .where(eq(faqsTable.id, params.data.id))
    .returning();
  if (!faq) {
    res.status(404).json({ error: "Pregunta no encontrada" });
    return;
  }

  const [row] = await db
    .select({
      id: faqsTable.id,
      serviceId: faqsTable.serviceId,
      question: faqsTable.question,
      answer: faqsTable.answer,
      priority: faqsTable.priority,
      active: faqsTable.active,
      serviceName: servicesTable.name,
    })
    .from(faqsTable)
    .leftJoin(servicesTable, eq(faqsTable.serviceId, servicesTable.id))
    .where(eq(faqsTable.id, faq.id));
  res.json(UpdateFaqResponse.parse(row));
});

router.delete("/faqs/:id", async (req, res): Promise<void> => {
  const params = DeleteFaqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [faq] = await db
    .delete(faqsTable)
    .where(eq(faqsTable.id, params.data.id))
    .returning();
  if (!faq) {
    res.status(404).json({ error: "Pregunta no encontrada" });
    return;
  }
  res.sendStatus(204);
});

export default router;