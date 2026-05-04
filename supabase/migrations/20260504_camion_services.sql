-- =====================================================================
-- Service de camiones
--
-- - camiones.km_actuales: odómetro actual (manual hoy, GPS futuro).
-- - camion_services: histórico de cada service realizado (km al hacerlo,
--   km objetivo del próximo, comprobante).
-- - v_camion_service_estado: estado calculado por camión (al_dia /
--   proximo / vencido / sin_service) usando umbral de 2.000 km.
-- - bucket services-camiones: privado, signed URLs, sha256 dedup.
-- =====================================================================

ALTER TABLE camiones ADD COLUMN IF NOT EXISTS km_actuales numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS camion_services (
  id               serial PRIMARY KEY,
  camion_id        integer NOT NULL REFERENCES camiones(id) ON DELETE CASCADE,
  fecha            date    NOT NULL DEFAULT current_date,
  km_service       numeric NOT NULL CHECK (km_service >= 0),
  km_proximo       numeric NOT NULL CHECK (km_proximo >= 0),
  obs              text,
  comprobante_url  text,
  comprobante_hash text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  deleted_at       timestamptz,
  CHECK (km_proximo > km_service)
);

CREATE INDEX IF NOT EXISTS camion_services_camion_idx
  ON camion_services(camion_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS camion_services_comp_hash_uq
  ON camion_services (comprobante_hash)
  WHERE comprobante_hash IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE camion_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camion_services_all ON camion_services;
CREATE POLICY camion_services_all ON camion_services FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW v_camion_service_estado AS
WITH ult AS (
  SELECT DISTINCT ON (camion_id)
    camion_id, fecha, km_service, km_proximo, comprobante_url, id
  FROM camion_services
  WHERE deleted_at IS NULL
  ORDER BY camion_id, fecha DESC, id DESC
)
SELECT
  c.id              AS camion_id,
  c.patente,
  c.km_actuales,
  ult.fecha         AS fecha_ultimo_service,
  ult.km_service    AS km_ultimo_service,
  ult.km_proximo    AS km_proximo_service,
  ult.comprobante_url AS comprobante_ultimo_service,
  CASE
    WHEN ult.camion_id IS NULL THEN 'sin_service'
    WHEN c.km_actuales >= ult.km_proximo THEN 'vencido'
    WHEN c.km_actuales >= ult.km_proximo - 2000 THEN 'proximo'
    ELSE 'al_dia'
  END AS estado,
  CASE
    WHEN ult.camion_id IS NULL THEN NULL
    ELSE ult.km_proximo - c.km_actuales
  END AS km_restantes
FROM camiones c
LEFT JOIN ult ON ult.camion_id = c.id;

INSERT INTO storage.buckets (id, name, public)
VALUES ('services-camiones', 'services-camiones', false)
ON CONFLICT (id) DO NOTHING;
