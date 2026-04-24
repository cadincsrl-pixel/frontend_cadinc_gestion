-- =====================================================================
-- Índices de performance (audit 2026-04-24).
--
-- Basado en análisis de hot paths:
-- - RPCs resolver_item_* filtran stock por material_id / solicitud_item_id.
-- - obras.auto-archivar filtra certificaciones por sem_key.
-- - gastos.detectarWarnings cruza tramos por chofer_id/camion_id/fecha.
-- - create_liquidacion_con_reintegros filtra tramos/adelantos/gastos
--   por liquidacion_id (ya existe para gastos_logistica).
-- - solicitudes.service filtra items por (solicitud_id, estado='pendiente').
-- - remitos_envio_item se consulta por remito_id e item_id.
-- - cert_materiales y cert_adicionales se consultan por obra_cod+sem_key.
--
-- Pre-verificado: todas las tablas tienen <10 filas hoy → CREATE INDEX
-- es instantáneo y no bloquea. Si alguna crece mucho a futuro, se puede
-- re-crear CONCURRENTLY.
-- =====================================================================

-- ── stock_movimientos ────────────────────────────────────────────
-- Filtro por material_id + orden por fecha DESC (reporte de movimientos).
create index if not exists stock_movimientos_material_id_idx
  on public.stock_movimientos (material_id, fecha desc);

-- Lookup por solicitud_item_id (revertir item, trazabilidad).
create index if not exists stock_movimientos_solicitud_item_id_idx
  on public.stock_movimientos (solicitud_item_id)
  where solicitud_item_id is not null;

-- ── tramos ───────────────────────────────────────────────────────
-- Filtros por chofer_id/camion_id + orden por fecha (gastos warnings,
-- reportes por chofer, UI ViajesTab).
create index if not exists tramos_chofer_id_idx
  on public.tramos (chofer_id, fecha_operacion desc);

create index if not exists tramos_camion_id_idx
  on public.tramos (camion_id, fecha_operacion desc);

-- Lookup por liquidacion_id (RPCs reabrir/eliminar_liquidacion).
create index if not exists tramos_liquidacion_id_idx
  on public.tramos (liquidacion_id)
  where liquidacion_id is not null;

-- ── certificaciones ──────────────────────────────────────────────
-- auto-archivar filtra por sem_key >= corteISO; sin índice es full scan.
-- El UNIQUE (obra_cod, sem_key, contrat_id) no lo cubre para sem_key solo.
create index if not exists certificaciones_sem_key_idx
  on public.certificaciones (sem_key);

-- ── solicitud_compra_item ────────────────────────────────────────
-- Filtros frecuentes: .eq('solicitud_id').eq('estado','pendiente').
create index if not exists solicitud_compra_item_solicitud_estado_idx
  on public.solicitud_compra_item (solicitud_id, estado);

-- ── adelantos ────────────────────────────────────────────────────
create index if not exists adelantos_chofer_id_idx
  on public.adelantos (chofer_id, fecha desc);

create index if not exists adelantos_liquidacion_id_idx
  on public.adelantos (liquidacion_id)
  where liquidacion_id is not null;

-- ── remitos_envio_item ───────────────────────────────────────────
create index if not exists remitos_envio_item_remito_id_idx
  on public.remitos_envio_item (remito_id);

create index if not exists remitos_envio_item_item_id_idx
  on public.remitos_envio_item (item_id);

-- ── cert_materiales / cert_adicionales ───────────────────────────
-- Filtros por obra_cod + fecha en certificaciones.service.
-- (Estas tablas no tienen sem_key; usan fecha directa.)
create index if not exists cert_materiales_obra_fecha_idx
  on public.cert_materiales (obra_cod, fecha desc);

create index if not exists cert_adicionales_obra_fecha_idx
  on public.cert_adicionales (obra_cod, fecha desc);
