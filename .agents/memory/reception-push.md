---
name: Avisos push de recepción
description: Decisiones de privacidad y continuidad para avisos en segundo plano
---

Una suscripción push es por dispositivo y puede sobrevivir al cierre de sesión o de la pestaña. La clave VAPID debe persistir entre reinicios; verificar que cada destinatario siga autorizado en el momento del envío y limitar el aviso a un texto genérico con enlace a la bandeja protegida.

**Why:** Una suscripción guardada no prueba autorización futura, y una clave efímera rompe los dispositivos suscritos. Las notificaciones del sistema son visibles en pantallas bloqueadas.

**How to apply:** Al añadir canales o cambiar la autorización de recepción, mantener la comprobación antes del envío y no incluir mensajes, nombres ni teléfonos en el contenido push.