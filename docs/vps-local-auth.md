# Acceso local de recepción en la VPS

El panel usa cuentas individuales y sesiones locales en PostgreSQL. El administrador crea las cuentas desde `/admin/users`; no hay registro público. La contraseña inicial se comunica a cada persona por un canal privado y se puede cambiar desde `/account`. Los usuarios y las contraseñas de Clerk administrado por Replit **no se migran**. Cada persona deberá volver a activar sus avisos push o de WhatsApp con su nueva cuenta.

## Primera instalación o actualización desde Clerk

Hacer una copia de seguridad de PostgreSQL antes de aplicar cambios de esquema. El servidor web debe seguir sirviendo `artifacts/estetica-bot/dist/public` y enviando `/api` a la API en el puerto 5100. Trabajar en la VPS como administrador del sistema; no pegar contraseñas ni el contenido de `/etc/botnovaskin.env` en el chat ni en el historial de la terminal.

**No basta con compilar solo la API:** ahora es necesario actualizar dependencias, crear las tablas de usuarios y sesiones, compilar también el panel y crear el primer administrador. Los comandos siguientes se detienen si falla una etapa; no reiniciar la API si una compilación falla.

```bash
OWNER=$(stat -c '%U' /opt/botnovaskin)
sudo -u "$OWNER" -H git -C /opt/botnovaskin pull --ff-only origin main
sudo -u "$OWNER" -H bash -lc 'cd /opt/botnovaskin && corepack pnpm@10.26.1 install --frozen-lockfile'
```

Confirmar que `/etc/botnovaskin.env` aún define `DATABASE_URL` para **la base de datos dedicada de esta VPS**. Cargarla sin imprimir su valor y aplicar únicamente el esquema de esta aplicación:

```bash
sudo bash -c '
  set -a
  . /etc/botnovaskin.env
  set +a
  sudo --preserve-env=DATABASE_URL -u "$(stat -c %U /opt/botnovaskin)" -H bash -lc "cd /opt/botnovaskin && corepack pnpm@10.26.1 --filter @workspace/db run push"
'
```

Si Drizzle propone eliminar tablas o columnas existentes, **no confirmar**: detenerse y revisar el cambio. Tras aplicar el esquema, compilar ambos componentes:

```bash
sudo -u "$OWNER" -H bash -lc 'cd /opt/botnovaskin && corepack pnpm@10.26.1 --filter @workspace/api-server run build && PORT=5173 BASE_PATH=/ NODE_ENV=production corepack pnpm@10.26.1 --filter @workspace/estetica-bot run build'
```

Crear el primer administrador **una sola vez**. El programa pedirá el correo y la contraseña de forma interactiva y ocultará la contraseña; no pasarla como argumento ni variable de entorno. Usa la misma `DATABASE_URL` de la API:

```bash
sudo bash -c '
  set -a
  . /etc/botnovaskin.env
  set +a
  sudo --preserve-env=DATABASE_URL -u "$(stat -c %U /opt/botnovaskin)" -H bash -lc "cd /opt/botnovaskin && node artifacts/api-server/dist/bootstrap-admin.mjs"
'
```

La creación inicial se rechaza si ya existe una cuenta local. Después, el administrador inicia sesión en `/sign-in` y crea cuentas desde `/admin/users`. Nunca abrir un registro público ni compartir una sola cuenta entre varias personas.

## Si aparece «Correo o contraseña incorrectos»

Ese mensaje significa que la cuenta no existe en **la base de datos usada por la API de la VPS** o que la contraseña no coincide. Las credenciales del entorno de desarrollo no funcionan en la VPS. Tampoco basta con proponer un correo y contraseña en el chat: la cuenta tiene que crearse efectivamente en esa base de datos.

Después de actualizar el repositorio y compilar la API, ejecuta desde la terminal de la VPS como administrador del sistema:

```bash
sudo bash -c '
  set -a
  . /etc/botnovaskin.env
  set +a
  sudo --preserve-env=DATABASE_URL -u "$(stat -c %U /opt/botnovaskin)" -H bash -lc "cd /opt/botnovaskin && node artifacts/api-server/dist/recover-admin.mjs"
'
```

El comando muestra los correos de administradores activos. Si aún no hay cuentas, crea el primer administrador; si ya existe el administrador que selecciones, establece **una contraseña nueva** y cierra sus sesiones anteriores. Pide el correo y la contraseña dos veces directamente en la terminal; no los recibe por argumentos ni imprime la contraseña. Si existe otra cuenta pero no hay administradores activos, se detiene sin cambiar nada.

Usa el correo exacto que muestre el comando. Si una contraseña anterior se compartió en un chat, no la reutilices: elige una nueva solo en la terminal de la VPS. Después inicia sesión en `/sign-in`. Si el comando falla por tabla inexistente, aplica primero el paso de esquema de esta guía; si falla por conexión, comprueba que el `DATABASE_URL` cargado sea el mismo que usa `botnovaskin-api`.

Reiniciar y comprobar **la respuesta HTTP**, no solo `systemctl is-active`:

```bash
sudo systemctl restart botnovaskin-api
sleep 3
curl -fsS http://127.0.0.1:5100/api/healthz
curl -fsS https://apineoskin.nexxo.com.mx/api/healthz
sudo systemctl status botnovaskin-api --no-pager -l
```

Ambas consultas de salud deben devolver `{"status":"ok"}`. Probar el inicio de sesión y el simulador desde el navegador HTTPS, y comprobar que una sesión sin iniciar no puede consultar `/api/bot/conversations` ni `/api/dashboard`. Si falla, revisar `sudo journalctl -u botnovaskin-api -n 80 --no-pager` antes de repetir la compilación; ocultar valores privados al compartir registros.

El valor antiguo de `RECEPTION_ALLOWED_EMAILS` ya no determina quién puede entrar: las cuentas activas y sus roles en PostgreSQL son la fuente de autorización. Las claves `CLERK_*` dejan de ser necesarias para esta versión; retirarlas de la VPS únicamente después de comprobar el nuevo acceso.

## Error separado de recordatorios de WhatsApp

Si los registros muestran `(#132001) Template name does not exist in the translation` para `recordatorio_cita_24h`, Meta no encuentra una plantilla aprobada con **ese nombre exacto y el idioma configurado** en la cuenta de WhatsApp conectada. El error no depende del inicio de sesión. Corregir el nombre y el idioma en la configuración de recordatorios de la VPS o crear y aprobar la plantilla en Meta; no marcar el recordatorio como entregado si el envío falla.