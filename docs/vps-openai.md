# OpenAI para BotNovaSkin en la VPS

La integración usa la API estándar de OpenAI directamente desde Node.js. No depende de Replit ni requiere instalar paquetes adicionales.

## Variables privadas

Editar el archivo existente:

```bash
sudo nano /etc/botnovaskin.env
```

Agregar:

```bash
OPENAI_API_KEY=REEMPLAZAR_CON_LA_CLAVE_REAL
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT_MS=12000
```

No guardar la clave en GitHub, el código, el panel o el chat.

Confirmar que el archivo siga siendo privado:

```bash
sudo chown root:root /etc/botnovaskin.env
sudo chmod 600 /etc/botnovaskin.env
```

## Actualización

Después de llevar el código actualizado a `/opt/botnovaskin`:

```bash
cd /opt/botnovaskin
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
sudo systemctl restart botnovaskin-api.service
sudo systemctl status botnovaskin-api.service --no-pager
```

Revisar el arranque:

```bash
sudo journalctl -u botnovaskin-api.service -n 100 --no-pager
```

Debe aparecer un registro con:

```text
AI assistant configuration loaded
aiConfigured: true
```

El registro nunca muestra la clave.

## Comportamiento

1. Las reglas médicas y las acciones de cita se procesan antes que la IA.
2. La IA recibe solamente FAQs activas y el historial reciente.
3. Cada respuesta debe indicar al servidor qué FAQ la respalda.
4. Si OpenAI indica que no existe información suficiente, la conversación se asigna a recepción.
5. Si OpenAI está caído o excede el tiempo límite, el bot continúa con el buscador determinista actual.
6. Sin `OPENAI_API_KEY`, el bot funciona como antes y no hace llamadas externas.