---
name: VPS AlmaLinux compartida
description: Restricciones duraderas para desplegar BotNovaSkin en la VPS existente
---

La VPS de producción usa AlmaLinux 9.7 y ya aloja otros proyectos detrás de Nginx y PostgreSQL 15. Los puertos 5000, 5001 y 8080 están ocupados; BotNovaSkin debe usar un servicio y un puerto interno independientes, sin reinicializar PostgreSQL ni reemplazar configuraciones existentes de Nginx.

Toda funcionalidad de producción, incluida una futura integración de IA, debe poder ejecutarse desde la VPS. No debe depender de proxies, credenciales administradas o servicios disponibles únicamente dentro del entorno de desarrollo de Replit.

**Why:** El despliegue comparte servidor con aplicaciones existentes; cambiar paquetes globales, puertos o bloques generales puede causar interrupciones.

**How to apply:** Ejecutar la API con un servicio `systemd` propio en el puerto 5100, servir el panel mediante un bloque exacto para `apineoskin.nexxo.com.mx`, recargar Nginx en lugar de reiniciarlo y usar una base de datos/rol PostgreSQL dedicados. Para IA, elegir un proveedor accesible por API desde AlmaLinux y guardar sus credenciales únicamente en `/etc/botnovaskin.env`.