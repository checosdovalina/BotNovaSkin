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