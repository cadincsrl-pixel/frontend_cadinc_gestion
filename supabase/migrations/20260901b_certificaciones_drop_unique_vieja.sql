-- =====================================================================
-- Contratistas: presupuestos múltiples — FASE 2a.
-- Dropea la UNIQUE vieja (obra_cod, sem_key, contrat_id) de certificaciones.
-- Recién a partir de acá se pueden certificar 2 presupuestos distintos la
-- misma semana (la identidad nueva es certificaciones_contrat_sem_presup_uq,
-- creada en 20260901_contrat_presupuestos.sql).
--
-- ⚠ APLICAR SOLO DESPUÉS de que el backend nuevo esté deployado en prod:
--   el backend viejo hace onConflict sobre estas 3 columnas y sin el índice
--   Postgres rechaza el INSERT → PUT /cert en 500.
-- =====================================================================
alter table public.certificaciones
  drop constraint if exists certificaciones_obra_cod_sem_key_contrat_id_key;
