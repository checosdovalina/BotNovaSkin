# Estética Bot

Panel para administrar tratamientos, preguntas frecuentes, citas y la preparación de un bot de atención por WhatsApp para una estética.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/estetica-bot/src/pages/` — dashboard, agenda, tratamientos, preguntas del bot y simulador de WhatsApp.
- `artifacts/api-server/src/routes/` — endpoints del panel y disponibilidad.
- `artifacts/api-server/src/routes/webhooks.ts` — verificación y recepción inicial de eventos de WhatsApp.
- `lib/api-spec/openapi.yaml` — contrato único de la API.
- `lib/db/src/schema/` — tablas de tratamientos, preguntas frecuentes y citas.

## Architecture decisions

- La primera versión funciona sin WhatsApp conectado para que el flujo se pueda validar con datos reales antes de configurar Meta.
- Los tratamientos y preguntas frecuentes se cargan desde PostgreSQL y se pueden administrar desde el panel.
- El bot no diagnostica ni decide elegibilidad médica; las dudas clínicas se derivan a una valoración profesional.
- La conexión a WhatsApp está representada como pendiente hasta que se configure el webhook oficial de Meta.

## Product

- Resumen diario de citas y estado del bot.
- Agenda con creación, edición, filtros y estados.
- Catálogo editable de seis tratamientos.
- Preguntas frecuentes agrupadas por tratamiento.
- Simulador de conversación y guía de preparación del webhook.

## User preferences

- El usuario solicitó instrucciones paso a paso en español.

## Gotchas

- Mantener `lib/api-spec/openapi.yaml` como fuente de verdad y ejecutar codegen después de cada cambio.
- Las rutas del servidor se sirven bajo `/api`; el frontend debe usar los hooks generados.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
