-- =====================================================================
-- v_chofer_documentos_vencimientos
--
-- Espejo de v_vehiculo_documentos_vencimientos pero para choferes:
-- DNI, licencia de conducir, libreta sanitaria, CNRT, aptitud psico-
-- física, ART, MOPP, etc. Solo trae el documento más reciente por
-- (chofer, tipo) para no devolver versiones viejas re-uploadeadas.
--
-- Usada por la campana de notificaciones del topbar (sección "Docs
-- de choferes").
-- =====================================================================

CREATE OR REPLACE VIEW v_chofer_documentos_vencimientos AS
WITH ult AS (
  SELECT DISTINCT ON (chofer_id, tipo)
    id, chofer_id, tipo, vence_el, nombre_archivo, created_at
  FROM chofer_documentos
  WHERE vence_el IS NOT NULL AND deleted_at IS NULL
  ORDER BY chofer_id, tipo, created_at DESC
)
SELECT
  u.id          AS doc_id,
  u.chofer_id,
  c.nombre      AS chofer_nombre,
  u.tipo,
  u.vence_el,
  u.nombre_archivo
FROM ult u
JOIN choferes c ON c.id = u.chofer_id;
