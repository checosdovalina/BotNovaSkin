---
name: Subidas a GitHub desde la terminal
description: Distinción entre la conexión GitHub de Replit y la autenticación de git push
---

La conexión GitHub vinculada a Replit puede tener permiso de escritura por API sin autenticar `git push` en la terminal. No confundir acceso a la API con credenciales disponibles para Git.

**Why:** Un repositorio con acceso de escritura mediante la conexión rechazó `git push` por falta de autenticación de Git. Los cambios incluían muchos commits y archivos binarios, así que sustituir la subida por ediciones de archivos mediante API habría perdido el historial y arriesgado un resultado parcial.

**How to apply:** Primero verificar que la rama remota sea antecesora de la local y no usar `--force`. Si Git no está autenticado, solicitar acceso de alcance mínimo mediante el flujo seguro de secretos y usar un helper de credenciales temporal para una sola subida, sin guardar credenciales en la configuración de Git. No mostrar ni registrar el valor.