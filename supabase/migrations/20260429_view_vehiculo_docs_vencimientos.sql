-- =====================================================================
-- v_vehiculo_documentos_vencimientos
--
-- Une los documentos de camion + batea con vence_el cargado, tomando
-- SOLO el más reciente por (entidad, entidad_id, tipo). Eso evita
-- mostrar duplicados cuando se reuploadea un mismo doc varias veces.
--
-- Usada por la campana de notificaciones del topbar para detectar
-- papeles vencidos o próximos a vencer (RTO, póliza de seguro, etc.).
-- =====================================================================

CREATE OR REPLACE VIEW v_vehiculo_documentos_vencimientos AS
WITH camion_ult AS (
  SELECT DISTINCT ON (camion_id, tipo)
    id, camion_id, tipo, vence_el, nombre_archivo, created_at
  FROM camion_documentos
  WHERE vence_el IS NOT NULL AND deleted_at IS NULL
  ORDER BY camion_id, tipo, created_at DESC
),
batea_ult AS (
  SELECT DISTINCT ON (batea_id, tipo)
    id, batea_id, tipo, vence_el, nombre_archivo, created_at
  FROM batea_documentos
  WHERE vence_el IS NOT NULL AND deleted_at IS NULL
  ORDER BY batea_id, tipo, created_at DESC
)
SELECT
  cu.id            AS doc_id,
  'camion'::text   AS entidad,
  cu.camion_id     AS entidad_id,
  c.patente        AS entidad_patente,
  cu.tipo,
  cu.vence_el,
  cu.nombre_archivo
FROM camion_ult cu
JOIN camiones c ON c.id = cu.camion_id
UNION ALL
SELECT
  bu.id,
  'batea'::text,
  bu.batea_id,
  b.patente,
  bu.tipo,
  bu.vence_el,
  bu.nombre_archivo
FROM batea_ult bu
JOIN bateas b ON b.id = bu.batea_id;
