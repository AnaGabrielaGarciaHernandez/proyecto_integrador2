# Política de retención y controles de datos

**Versión:** 1.0.0 · **Fecha:** 25 de julio de 2026

Esta política implementa criterios técnicos para EcoBazar y complementa el aviso de privacidad. Los plazos definitivos de conservación contractual, fiscal y probatoria deben confirmarse con asesoría legal y contable para `[RAZÓN SOCIAL]`.

## Principios operativos

1. Conservar solo lo necesario para una finalidad identificada.
2. Separar datos activos, bloqueados y eliminados.
3. Anonimizar o disociar cuando la conservación estadística u operativa no requiera identificar a la persona.
4. Mantener una retención legal cuando exista obligación, relación contractual, investigación o defensa de derechos.
5. Registrar las solicitudes de privacidad sin registrar contraseñas, archivos, claves ni eventos de pago crudos.
6. Ejecutar borrado distribuido de forma idempotente y auditable mediante `correlation_id`.

## Matriz de retención

| Recurso | Estado activo | Después de finalizar finalidad o pedir cancelación | Acción y responsable |
| --- | --- | --- | --- |
| Perfil y preferencias | Mientras la cuenta esté activa | Desactivación inmediata; anonimización asíncrona de datos no necesarios | Identity service; `privacy_requests` |
| Sesiones | Hasta expiración o revocación | 30 días para limpieza técnica | Identity service; job de mantenimiento |
| Solicitudes de exportación/eliminación | Durante su procesamiento | Solicitudes completadas: 365 días, salvo `retention_hold`; después supresión | Identity service |
| Avatar en Supabase | Mientras la URL sea válida | Borrado del objeto propio al reemplazarlo o completar eliminación | Identity service; rutas servidor `avatars/{userId}/{uuid}.webp` |
| Carrito | Mientras exista la cuenta | Eliminación al completar la solicitud de eliminación | Cart service |
| Lista de deseos | Mientras exista la cuenta | Eliminación al completar la solicitud de eliminación | Catalog service |
| Productos y publicaciones | Mientras la relación de vendedor exista | Se retiran de circulación y se anonimizan referencias del vendedor; conservar solo lo necesario para pedidos o disputas | Catalog service |
| Solicitudes de vendedor y archivos | Mientras se resuelven | Supresión o anonimización al completar eliminación, sujeto a disputas | Catalog service |
| Pedidos | Durante la relación contractual | Bloqueo durante prescripción/obligaciones; después supresión o disociación | Order service |
| Pagos y conciliación | Durante la relación contractual y obligaciones fiscales | Bloqueo durante el plazo legal; después supresión de secretos/eventos crudos y disociación de referencias | Payment service |
| Reseñas, reportes y acciones de moderación | Mientras sean necesarios para seguridad y defensa | Se elimina la identidad del autor y se conserva solo contenido mínimo cuando exista una razón documentada | Moderation service |
| Logs de aplicación | 30 días | Supresión automática, salvo incidente abierto o `legal hold` documentado | Infraestructura de contenedores |
| Logs de seguridad y privacidad | 12 meses | Supresión o disociación al vencer el plazo | Infraestructura / Identity service |
| Buckets de rate limiting | Dos ventanas después de su última actualización | Limpieza automática | Cada servicio, PostgreSQL |
| Backups | Según la ventana operativa contratada | Expiración criptográfica o borrado conforme a la plataforma | Infraestructura; pendiente de habilitar producción |

Los periodos de pedidos, pagos, logs de seguridad y respaldos son objetivos operativos iniciales; se deben sustituir por el plazo concreto que resulte de las obligaciones aplicables a la operación real.

## Exportación

`GET /api/auth/privacy/export` requiere sesión y tiene un límite de seis solicitudes por 24 horas por usuario. La respuesta contiene:

- Perfil serializado.
- Datos exportables recibidos de catálogo, carrito, pedidos, pagos y moderación.
- `schema_version` y fecha de generación.
- Lista explícita de categorías excluidas.

Nunca se incluyen `password_hash`, tokens de sesión, claves internas, claves de Supabase, secretos de Stripe, eventos de pago crudos ni datos personales de otras personas. El navegador genera un archivo JSON local y no almacena la copia en el servidor.

## Eliminación y bloqueo

`POST /api/auth/privacy/deletion-request` exige sesión y la confirmación exacta `ELIMINAR`. La operación:

1. Registra una solicitud idempotente.
2. Desactiva la cuenta y revoca sesiones inmediatamente.
3. Un worker con reintentos llama endpoints internos autenticados de cada dominio.
4. Anonimiza referencias de catálogo, carrito, pedidos, pagos y moderación.
5. Borra el avatar propio si pertenece al bucket configurado.
6. Sustituye identidad, correo y credenciales de la cuenta por valores no utilizables.
7. Conserva solicitudes completadas durante el plazo definido, salvo retención legal.

Si un dominio no responde, el estado pasa a `failed` con un código técnico sin contenido sensible y se reintenta con backoff. La operación está diseñada para ser idempotente. Un `retention_hold` debe estar respaldado por una razón, responsable y fecha de revisión; esa administración aún requiere una herramienta interna de cumplimiento.

## Controles de seguridad

- Service key de Supabase, tokens internos y claves de firma solo en secretos del backend.
- Bucket público únicamente para lectura; el navegador no puede subir directamente.
- Límites de 5 MB de entrada, 300 KB de salida, 4096 × 4096, 16 MP y WebP 256 × 256 para avatares.
- Validación MIME y decodificación real con `sharp`; sin SVG.
- Rutas de objetos nuevas, `upsert: false`, cache de un año y eliminación del objeto anterior después de actualizar la base.
- Rate limit con clave HMAC, no con IP o usuario en claro dentro de PostgreSQL.
- Headers de identidad y `x-client-ip` generados por el gateway, nunca aceptados directamente del navegador.
- Logs JSON sin query strings, cuerpos, headers sensibles, imágenes ni errores crudos; mensajes redactados y limitada la longitud.
- Docker `json-file` con rotación configurable (`LOG_MAX_SIZE`, `LOG_MAX_FILE`).

## Incidentes y excepciones

Un incidente de seguridad debe abrir un registro con `correlation_id`, servicio, fecha, alcance técnico, medidas de contención y decisión de comunicación. No se incluirá contenido de imágenes, contraseñas, tokens ni claves en el registro.

Las excepciones de retención deben documentarse como `legal_hold`, con finalidad, base, datos afectados, fecha de inicio, responsable y fecha de revisión. Al finalizar el hold se reanuda el ciclo de bloqueo y supresión.

## Backups y restauración

El diseño de backups cifrados, pruebas de restauración y reconciliación de solicitudes de eliminación queda fuera de esta primera implementación. Antes de producción se deberá definir:

- proveedor, región y cifrado;
- ventana y retención de snapshots;
- control de acceso y registro de restauraciones;
- procedimiento para volver a aplicar eliminaciones después de restaurar;
- prueba periódica de RPO/RTO y evidencia de resultado.

