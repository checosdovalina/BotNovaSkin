import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, servicesTable } from "@workspace/db";
import {
  CreateServiceBody,
  CreateServiceResponse,
  DeleteServiceParams,
  ListServicesResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/services", async (req, res): Promise<void> => {
  req.log.info("Listing beauty services");
  const services = await db
    .select()
    .from(servicesTable)
    .orderBy(servicesTable.category, servicesTable.name);
  res.json(ListServicesResponse.parse(services));
});

router.post("/services", async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db
    .insert(servicesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(CreateServiceResponse.parse(service));
});

router.patch("/services/:id", async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  const body = UpdateServiceBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [service] = await db
    .update(servicesTable)
    .set(body.data)
    .where(eq(servicesTable.id, params.data.id))
    .returning();
  if (!service) {
    res.status(404).json({ error: "Tratamiento no encontrado" });
    return;
  }
  res.json(UpdateServiceResponse.parse(service));
});

router.delete("/services/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [service] = await db
    .update(servicesTable)
    .set({ active: false })
    .where(eq(servicesTable.id, params.data.id))
    .returning();
  if (!service) {
    res.status(404).json({ error: "Tratamiento no encontrado" });
    return;
  }
  res.sendStatus(204);
});

export default router;