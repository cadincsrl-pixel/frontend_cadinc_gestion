-- =====================================================================
-- choferes.batea_id — batea preasignada al chofer
--
-- Cada chofer ya tenía un camión preasignado (camion_id). Algunas
-- empresas también dejan fija una batea por chofer; este campo lo
-- permite. Es opcional (nullable) y sin FK estricta para mantener el
-- patrón existente de `camion_id`.
-- =====================================================================

ALTER TABLE choferes ADD COLUMN IF NOT EXISTS batea_id integer;
