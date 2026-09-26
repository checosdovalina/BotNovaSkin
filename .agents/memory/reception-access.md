---
name: Acceso de recepción
description: Criterio de autorización para conversaciones privadas de WhatsApp
---

En la VPS, una sesión válida solo autoriza operaciones de recepción cuando corresponde a una cuenta local activa creada por el administrador. El autorregistro público debe permanecer cerrado. No conservar una segunda lista de correos como requisito de acceso: una cuenta creada por el administrador debe poder operar el simulador y la bandeja sin editar variables de entorno.

**Why:** La lista de correos verificados era necesaria cuando cualquier persona podía abrir una cuenta de Clerk. El usuario eligió cuentas individuales gestionadas por el administrador en la VPS; mantener la lista antigua bloquearía a personal recién dado de alta. Las identidades antiguas de Clerk tampoco deben recibir avisos ni acceder a conversaciones.

**How to apply:** Comprobar en base de datos la actividad y el rol en cada acceso privado; mantener el webhook público solo con su verificación de firma. Los permisos de administrador siguen siendo separados de los de recepción. Revocar sesiones y avisos al desactivar una cuenta.