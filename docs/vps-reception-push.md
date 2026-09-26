# Avisos push de recepción en la VPS

El servidor envía notificaciones push a los navegadores que recepción haya autorizado en la bandeja. No contienen nombres, teléfonos ni mensajes; al abrirlas se accede a la ruta protegida `/conversations`.

## Configuración de producción

En `/etc/botnovaskin.env` agregar:

```bash
VAPID_SUBJECT=https://apineoskin.nexxo.com.mx
```

El valor debe ser una URL pública HTTPS de este servicio (o una dirección `mailto:` de contacto). Si cambia el dominio, actualizar la variable; no cambiar las claves VAPID generadas en PostgreSQL, ya que esto invalidaría las suscripciones existentes. En la VPS se usa `https://apineoskin.nexxo.com.mx` por defecto si no se define esta variable; en Replit se usa el dominio del entorno. No guardar claves privadas en el repositorio.

Antes de reiniciar el servicio en la VPS, aplicar el esquema actualizado a su base PostgreSQL dedicada mediante `pnpm --filter @workspace/db run push`, cargando `DATABASE_URL` del archivo privado para el usuario propietario del proyecto. Se crean las tablas de claves y suscripciones push. No ejecutar contra otras bases del servidor.

La página debe servirse con HTTPS para que el navegador permita notificaciones y trabajadores de servicio. Desde una cuenta autorizada, activar los avisos en `/conversations` y aceptar el permiso del navegador. El permiso es por navegador/dispositivo. Si se deniega o el navegador no admite push, el contador y los avisos dentro de la bandeja siguen funcionando. Comprobar en un navegador real que una nueva derivación recibida con la pestaña cerrada muestra el aviso y abre la bandeja protegida.

## Canal alternativo de WhatsApp

Recepción puede optar por recibir avisos de derivaciones en su propio WhatsApp aunque el navegador no admita push. Es independiente del permiso del navegador y se desactiva desde la misma bandeja. El número debe estar en formato internacional (solo dígitos). El envío requiere que WhatsApp Business ya esté conectado con `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.

Crear y aprobar en Meta una plantilla de **Utilidad**, idioma **es_MX**, con un solo parámetro de texto en el cuerpo y este contenido exacto:

```text
Nueva solicitud para recepción. Abre la bandeja protegida: {{1}}. Acceso exclusivo para personal autorizado.
```

No incluir datos de clientes en la plantilla, encabezado, pie ni botones. El parámetro es únicamente la URL HTTPS de la bandeja, que requiere iniciar sesión. Una plantilla aprobada puede enviarse aun fuera de la ventana de 24 horas de WhatsApp. Configurar en el entorno del servidor:

```bash
RECEPTION_WHATSAPP_TEMPLATE=aviso_recepcion
RECEPTION_WHATSAPP_VERIFY_TEMPLATE=verificar_recepcion
RECEPTION_INBOX_URL=https://tu-dominio-publico/conversations
```

Crear y aprobar también una plantilla de **Utilidad**, idioma **es_MX**, con un parámetro en el cuerpo:

```text
Tu código para activar avisos de recepción es {{1}}. Vence en 10 minutos. Si no lo solicitaste, ignora este mensaje.
```

El nombre configurado en `RECEPTION_WHATSAPP_VERIFY_TEMPLATE` debe coincidir con el de la plantilla aprobada. La plantilla de verificación solo se envía al solicitar un código; no incluir datos de clientes. La persona de recepción introduce el código en la bandeja antes de recibir avisos. Al cambiar de número se desactiva el anterior en cuanto se acepta la solicitud de código; el nuevo no recibe avisos hasta confirmarse. Los números almacenados antes de esta versión deben confirmarse de nuevo. `SESSION_SECRET` debe seguir configurado y estable en el servidor para validar los códigos pendientes.

La URL debe ser la **dirección pública real de la web**, no la de la API, terminar exactamente en `/conversations` y no contener parámetros ni credenciales. Si el sitio está publicado en Replit, usar su dominio de producción, no el dominio temporal de desarrollo. Si falta la plantilla, la URL o las credenciales de WhatsApp, el panel indica que el canal no está disponible y no permite activarlo. Reiniciar el servidor tras configurar las variables y aplicar el esquema a la base correspondiente antes de usar el canal.