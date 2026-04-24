-- =====================================================================
-- Drop de tablas muertas del modelo paralelo viejo + columna duplicada.
--
-- Contexto: el audit de 2026-04-24 identificó tablas con 0-1 filas de prueba
-- que quedaron del modelo paralelo histórico (antes de tramos/gastos_logistica).
-- Ya no se escriben ni se leen desde la codebase actual; mantenerlas agrega
-- confusion, costo de schema advisors y bitrot.
--
-- Pre-verificación (ejecutada manualmente con MCP):
-- - camiones_gastos:     0 filas. Reemplazada por gastos_logistica.
-- - viajes:              1 fila de prueba. Reemplazada por tramos.
-- - cargas:              1 fila de prueba. Reemplazada por tramos.fecha_carga/remito_carga.
-- - descargas:           1 fila de prueba. Reemplazada por tramos.fecha_descarga/...
-- - liquidacion_viajes:  0 filas. Del modelo de liquidaciones viejo.
-- - liquidacion_tramos:  0 filas. La única referencia en código (tramos.service.ts
--                        delete) fue eliminada en el commit hermano.
--
-- Referencias en código: grep exhaustivo confirma 0 usos activos.
--
-- ⚠ Las tablas `remitos` y `remito_items` NO son muertas — las usa el módulo
-- herramientas/remitos activamente. NO dropear.
--
-- También: camiones.año (100% NULL, duplicada por camiones.anio).
-- =====================================================================

-- Drop en orden de dependencias (hijos primero).
drop table if exists public.liquidacion_viajes cascade;
drop table if exists public.liquidacion_tramos cascade;
drop table if exists public.cargas             cascade;
drop table if exists public.descargas          cascade;
drop table if exists public.viajes             cascade;
drop table if exists public.camiones_gastos    cascade;

-- Columna duplicada (usamos anio, año estaba 100% NULL).
alter table public.camiones drop column if exists "año";
