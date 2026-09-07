-- 20260907p — Facundo Reinoso suma el módulo Áridos (user 2026-09-07)
--
-- Pedido: "dale a Facundo acceso al módulo áridos así como lo tiene Alina".
-- Se copia EXACTAMENTE el bloque de áridos de Alina Fernández, ni más ni menos:
--   { lectura, creacion, actualizacion, eliminacion } = true, sin `tabs`
--   (lista ausente = todas las tabs, igual que lo entienden la UI y requireTab).
--
-- Antes:  modulos = {logistica};  permisos = { tarja:{asistente_ia}, logistica:{...} }
-- Ojo con `tarja`: solo tiene el flag `asistente_ia` y NINGÚN `lectura`, así que
-- tarja NO figura en `modulos` y eso queda igual. No se toca.
--
-- `profiles.modulos` NO se mantiene solo: no hay trigger, lo deriva el backend
-- al escribir (CLAUDE.md §5.5). Al tocar `permisos` por SQL hay que recalcularlo
-- en la misma sentencia con `modulos_de_permisos()`, que es la misma regla
-- (módulos con lectura = true). Si no, Facundo tendría permiso en la API pero el
-- middleware de Next le seguiría bloqueando la página.
--
-- `personalizado` ya estaba en true (no sale de ninguna plantilla), así que un
-- "Aplicar rol" futuro no lo va a pisar.

update public.profiles
   set permisos = permisos || '{"aridos":{"lectura":true,"creacion":true,"actualizacion":true,"eliminacion":true}}'::jsonb,
       modulos  = public.modulos_de_permisos(
                    permisos || '{"aridos":{"lectura":true,"creacion":true,"actualizacion":true,"eliminacion":true}}'::jsonb)
 where id = 'c788a2b5-d58f-4d96-9a47-8539979922a3'
   and nombre = 'FACUNDO REINOSO'
   and permisos->'aridos' is null;
