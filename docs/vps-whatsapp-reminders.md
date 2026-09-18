# Recordatorios de citas por WhatsApp

## Plantillas requeridas en Meta

Crear dos plantillas de categoría **Utility/Utilidad**, idioma **Spanish (MEX) / es_MX**.

### `recordatorio_cita_24h`

```text
Hola {{1}}, te recordamos tu cita de {{2}} en NovaSkin para mañana, {{3}}, a las {{4}}. Si necesitas reprogramar o cancelar, responde a este mensaje.
```

### `recordatorio_cita_2h`

```text
Hola {{1}}, tu cita de {{2}} en NovaSkin es hoy, {{3}}, a las {{4}}. Te esperamos. Si necesitas ayuda, responde a este mensaje.
```

Las variables deben conservar este orden:

1. Nombre del cliente.
2. Tratamiento.
3. Fecha.
4. Hora.

## Variables privadas de la VPS

Después de que Meta apruebe ambas plantillas, agregar en `/etc/botnovaskin.env`:

```bash
WHATSAPP_REMINDER_24H_TEMPLATE=recordatorio_cita_24h
WHATSAPP_REMINDER_2H_TEMPLATE=recordatorio_cita_2h
WHATSAPP_REMINDER_24H_LANGUAGE=es
WHATSAPP_REMINDER_2H_LANGUAGE=es_MX
```

No agregar tokens o secretos al repositorio.

## Comportamiento

- El cliente escribe nuevamente su número durante el flujo de cita.
- El número debe coincidir con el WhatsApp desde el que conversa.
- Solo las citas confirmadas y con número verificado reciben recordatorios.
- Se envía un recordatorio hasta 24 horas antes y otro hasta 2 horas antes.
- Las citas canceladas no reciben mensajes.
- Al reprogramar una cita, sus recordatorios se reinician para la nueva fecha.
- Si las plantillas todavía no están configuradas, la API funciona normalmente y no intenta enviar recordatorios.