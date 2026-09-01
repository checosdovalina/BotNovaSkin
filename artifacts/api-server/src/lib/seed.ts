import { count } from "drizzle-orm";
import { db, faqsTable, servicesTable } from "@workspace/db";
import { logger } from "./logger";

const seedServices = [
  {
    name: "Toxina botulínica",
    slug: "toxina-botulinica",
    description: "Suaviza temporalmente las líneas de expresión del tercio superior.",
    price: 4500,
    durationMinutes: 45,
    category: "Rostro",
  },
  {
    name: "Bioestimuladores",
    slug: "bioestimuladores",
    description: "Mejora progresivamente la firmeza y calidad de la piel.",
    price: 9000,
    durationMinutes: 60,
    category: "Rostro",
  },
  {
    name: "PDRN de salmón",
    slug: "pdrn-salmon",
    description: "Tratamiento enfocado en hidratación, luminosidad y regeneración cutánea.",
    price: 0,
    durationMinutes: 45,
    category: "Piel",
  },
  {
    name: "Skinbooster",
    slug: "skinbooster",
    description: "Revitaliza la piel con hidratación y una apariencia más uniforme.",
    price: 0,
    durationMinutes: 45,
    category: "Piel",
  },
  {
    name: "NCTF revitalizante",
    slug: "nctf-revitalizante",
    description: "Complejo de activos para revitalizar, hidratar y dar luminosidad.",
    price: 0,
    durationMinutes: 45,
    category: "Piel",
  },
  {
    name: "Mesoterapia capilar",
    slug: "mesoterapia-capilar",
    description: "Apoya el cuidado del cuero cabelludo y la calidad del cabello.",
    price: 0,
    durationMinutes: 60,
    category: "Capilar",
  },
];

export async function seedDatabase(): Promise<void> {
  const [{ value: serviceCount }] = await db
    .select({ value: count() })
    .from(servicesTable);

  if (Number(serviceCount) > 0) {
    return;
  }

  const services = await db
    .insert(servicesTable)
    .values(seedServices)
    .returning();

  const faqRows = [
    {
      serviceId: services[0].id,
      question: "¿Cuánto dura el efecto de la toxina botulínica?",
      answer:
        "Generalmente dura entre 4 y 6 meses, aunque puede variar según cada paciente, la zona y la dosis.",
      priority: 10,
    },
    {
      serviceId: services[0].id,
      question: "¿Cuándo se ven los resultados?",
      answer:
        "Los cambios suelen comenzar a notarse entre el día 3 y el día 15. Se requiere valoración profesional.",
      priority: 9,
    },
    {
      serviceId: services[1].id,
      question: "¿Qué son los bioestimuladores?",
      answer:
        "Son tratamientos que buscan mejorar progresivamente la firmeza, elasticidad, textura y calidad de la piel.",
      priority: 10,
    },
    {
      serviceId: services[2].id,
      question: "¿Para qué sirve el PDRN de salmón?",
      answer:
        "Puede ayudar a mejorar la hidratación, luminosidad, textura y apariencia general de la piel.",
      priority: 10,
    },
    {
      serviceId: services[3].id,
      question: "¿El Skinbooster es un relleno?",
      answer:
        "No. Su objetivo principal es mejorar la hidratación y calidad de la piel, no modificar los rasgos del rostro.",
      priority: 10,
    },
    {
      serviceId: services[4].id,
      question: "¿Qué es NCTF revitalizante?",
      answer:
        "Es un tratamiento con múltiples activos enfocado en mejorar hidratación, luminosidad, textura y calidad de la piel.",
      priority: 10,
    },
    {
      serviceId: services[5].id,
      question: "¿La mesoterapia capilar ayuda contra la caída?",
      answer:
        "Puede ayudar en determinados casos, pero primero es importante identificar la causa de la caída mediante una valoración.",
      priority: 10,
    },
  ];

  await db.insert(faqsTable).values(faqRows);
  logger.info({ services: services.length, faqs: faqRows.length }, "Seed data created");
}