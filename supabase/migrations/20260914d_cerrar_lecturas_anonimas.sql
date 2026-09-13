-- Paso 3a de la auditoría del 12/09: nadie lee la base sin loguearse.
--
-- Hasta hoy, 81 tablas eran legibles con solo la clave publicable, que va en el
-- bundle del frontend y por lo tanto es pública: la cuenta del cliente entera
-- (2.663 renglones), el historial de precios (1.040), las facturas de compra, el
-- índice de documentos del personal y el historial de cambios de permisos.
--
-- La escritura ya estaba cerrada desde `20260906q`; lo que faltaba era la lectura.
-- Esto es la fase 3 de permisos, por el camino corto: en vez de escribir policies
-- tabla por tabla, se saca el GRANT. Postgres chequea el grant ANTES que la policy,
-- así que con esto las policies permisivas dejan de alcanzarse para `anon`.
--
-- Por qué `anon` no necesita NADA:
--   - El login pasa por GoTrue (schema `auth`), no por tablas de `public`.
--   - `middleware.ts` lee `profiles` sólo DESPUÉS de confirmar sesión, o sea como
--     `authenticated`; sin sesión redirige sin tocar la base.
--   - El frontend no usa realtime (verificado: 0 usos de postgres_changes).
--   - Storage vive en el schema `storage` y no lo toca este revoke.
--
-- `all tables` incluye vistas, así que también cierra las 4 vistas del aviso.
-- Se revierte con un `grant select ... to anon`.

revoke select on all tables in schema public from anon;

-- Y que las tablas FUTURAS no vuelvan a nacer abiertas: los default privileges de
-- `postgres` en `public` todavía le daban `r` (SELECT) a anon, así que cada
-- migración nueva reabría el agujero. La escritura ya estaba fuera del default.
alter default privileges for role postgres in schema public revoke select on tables from anon;
