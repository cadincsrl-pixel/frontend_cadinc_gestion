-- =====================================================================
-- adelantos.comprobante_url / comprobante_hash + bucket adelantos-logistica
--
-- Permite adjuntar un comprobante (foto/PDF) cuando se registra un
-- adelanto. Mismo patrón que `gastos_logistica`: signed-upload → PUT al
-- bucket → POST register; sha256 del archivo para evitar duplicados.
--
-- Diferencia con gastos: la tabla `adelantos` no tiene soft-delete,
-- por eso el UNIQUE no es partial sobre deleted_at — solo sobre el
-- hash cuando no es null.
-- =====================================================================

ALTER TABLE adelantos ADD COLUMN IF NOT EXISTS comprobante_url  text;
ALTER TABLE adelantos ADD COLUMN IF NOT EXISTS comprobante_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS adelantos_comprobante_hash_uq
  ON adelantos (comprobante_hash)
  WHERE comprobante_hash IS NOT NULL;

-- Bucket privado para los comprobantes. URLs de descarga se firman
-- desde el backend con TTL corto (15 min, igual que gastos).
INSERT INTO storage.buckets (id, name, public)
VALUES ('adelantos-logistica', 'adelantos-logistica', false)
ON CONFLICT (id) DO NOTHING;
