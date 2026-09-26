---
name: CLI de mantenimiento en VPS
description: Verificación de comandos locales de mantenimiento empaquetados como Node ESM
---

Los comandos empaquetados para administrar cuentas en la VPS deben comprobarse ejecutando su salida real de Node, no solo compilándolos o pasando TypeScript.

**Why:** Un bundle de CLI compiló sin errores, pero al ejecutarse falló al cargar PostgreSQL por un `require` dinámico incompatible con ESM. Esto podía dejar sin crear el primer administrador aunque la compilación hubiera parecido correcta.

**How to apply:** Antes de recomendar un comando de mantenimiento nuevo o modificado para la VPS, probar su bundle en desarrollo hasta que alcance una rama segura sin cambios de datos, o con una cuenta temporal eliminada después. No asumir que el resultado de `build` garantiza que el CLI se ejecuta.