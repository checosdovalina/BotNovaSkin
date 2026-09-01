---
name: OpenAPI y Zod
description: Compatibilidad entre Orval, OpenAPI y la versión de Zod del workspace.
---

En este workspace, el generador Orval puede producir `zod.int()` para campos OpenAPI de tipo entero, pero la versión instalada de Zod 3 no expone esa función. Los contratos que necesitan generar aquí deben evitar esa combinación o actualizar coordinadamente la versión de Zod y sus dependencias.

**Why:** El codegen puede completar y aun así fallar en el typecheck de las librerías, bloqueando las declaraciones usadas por el servidor.

**How to apply:** Antes de ampliar `lib/api-spec/openapi.yaml`, revisar el catálogo de Zod y ejecutar codegen inmediatamente después de cambios al contrato.