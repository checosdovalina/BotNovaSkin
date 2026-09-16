---
name: IA fundamentada para el bot
description: Límites y comportamiento de respaldo para respuestas generadas en producción.
---

La IA solo puede redactar respuestas respaldadas por FAQs activas y debe identificar las fuentes usadas. Si declara que la información es insuficiente, esa decisión tiene prioridad sobre coincidencias débiles y la conversación se deriva a recepción. Las acciones y reglas médicas se procesan antes de la IA.

**Why:** Palabras genéricas como “tratamiento” pueden recuperar contenido no relacionado, y una FAQ débil puede contradecir correctamente a la IA cuando esta reconoce que no sabe.

**How to apply:** Excluir vocabulario genérico de la recuperación, validar que las fuentes devueltas pertenezcan al contexto enviado y probar siempre respuesta fundamentada, desconocimiento, acciones prioritarias y falla del proveedor. Ante un error técnico de OpenAI, conservar el motor determinista en vez de interrumpir la atención.