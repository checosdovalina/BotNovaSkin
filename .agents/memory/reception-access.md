---
name: Acceso de recepción
description: Criterio de autorización para conversaciones privadas de WhatsApp
---

La identidad iniciada en Clerk no basta para autorizar operaciones de recepción. Exigir que el correo principal esté verificado y en la lista configurada por el responsable; si no hay lista o la verificación falla, denegar el acceso.

**Why:** Una cuenta recién creada no debe poder enumerar conversaciones, leer historiales ni enviar mensajes en nombre del negocio. Antes de esta decisión las rutas operativas podían usarse anónimamente.

**How to apply:** Mantener esta autorización tanto al introducir nuevas rutas de conversación como al modificar la autenticación. No reemplazar la lista por la simple presencia de una sesión.