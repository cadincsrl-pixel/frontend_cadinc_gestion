-- =====================================================================
-- Integración GPS Mobile Quest para camiones
--
-- - Columnas en camiones: mapeo (id_vehiculo_gps), última lectura GPS
--   (lat/lng/velocidad/timestamp), estado del último intento de sync.
-- - Tabla gps_sync_log: bitácora de cada intento (manual o cron) con
--   resultado, payload crudo y antes/después del km. Útil para debug.
-- - Política de update: km_actuales solo se reemplaza si km_gps >
--   km_actuales (mismo criterio que el módulo de services; protege contra
--   regresiones del odómetro o lecturas erróneas).
-- - id_vehiculo_gps UNIQUE PARTIAL: dos camiones distintos no pueden
--   apuntar al mismo vehículo de Mobile Quest, pero NULL es libre.
-- =====================================================================

ALTER TABLE camiones
  ADD COLUMN IF NOT EXISTS id_vehiculo_gps        text,
  ADD COLUMN IF NOT EXISTS km_actualizado_en      timestamptz,
  ADD COLUMN IF NOT EXISTS gps_ultima_lat         numeric(10,7),
  ADD COLUMN IF NOT EXISTS gps_ultima_lng         numeric(10,7),
  ADD COLUMN IF NOT EXISTS gps_ultima_velocidad   numeric(6,2),
  ADD COLUMN IF NOT EXISTS gps_ultima_lectura_en  timestamptz,
  ADD COLUMN IF NOT EXISTS gps_ultimo_sync_en     timestamptz,
  ADD COLUMN IF NOT EXISTS gps_ultimo_sync_estado text
    CHECK (gps_ultimo_sync_estado IS NULL OR gps_ultimo_sync_estado IN ('ok', 'error', 'no_match', 'sin_cambio')),
  ADD COLUMN IF NOT EXISTS gps_ultimo_sync_error  text;

CREATE UNIQUE INDEX IF NOT EXISTS camiones_id_vehiculo_gps_uq
  ON camiones(id_vehiculo_gps)
  WHERE id_vehiculo_gps IS NOT NULL;

CREATE TABLE IF NOT EXISTS gps_sync_log (
  id              bigserial PRIMARY KEY,
  camion_id       integer REFERENCES camiones(id) ON DELETE SET NULL,
  id_vehiculo_gps text,
  patente_gps     text,
  tipo            text NOT NULL CHECK (tipo IN ('manual_individual', 'manual_global', 'cron')),
  estado          text NOT NULL CHECK (estado IN ('ok', 'error', 'no_match', 'sin_cambio')),
  km_anterior     numeric,
  km_nuevo        numeric,
  velocidad       numeric(6,2),
  lectura_gps_en  timestamptz,
  error_mensaje   text,
  payload_raw     jsonb,
  duracion_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);

CREATE INDEX IF NOT EXISTS gps_sync_log_camion_idx
  ON gps_sync_log(camion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gps_sync_log_created_idx
  ON gps_sync_log(created_at DESC);

ALTER TABLE gps_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gps_sync_log_all ON gps_sync_log;
CREATE POLICY gps_sync_log_all ON gps_sync_log FOR ALL USING (true) WITH CHECK (true);
