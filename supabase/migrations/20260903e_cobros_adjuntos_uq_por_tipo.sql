-- =====================================================================
-- El dedup de adjuntos del cobro pasa a ser POR SLOT, no por cobro.
--
-- El único era (cobro_id, hash_sha256): el mismo archivo no podía repetirse
-- en un cobro ni siquiera con otro `tipo`. Con las retenciones eso se vuelve
-- un problema real — la empresa suele mandar UN PDF que es a la vez el
-- comprobante de la transferencia y el certificado de retención, y el
-- usuario lo quiere en los dos slots. Con el único viejo el segundo insert
-- tiraba 23505 → ADJ_DUPLICADO, y el frontend absorbe ese código (es el
-- camino normal de reintento tras un fallo parcial): la retención se perdía
-- en silencio.
--
-- Agregando `tipo` a la clave, el dedup sigue haciendo lo que tenía que
-- hacer (no subir dos veces el mismo archivo al mismo slot) y deja de
-- bloquear el caso legítimo. Relajar un único nunca puede chocar con datos
-- existentes: lo que entraba antes entra ahora.
-- =====================================================================

drop index if exists public.cobros_adjuntos_cobro_hash_uq;

create unique index if not exists cobros_adjuntos_cobro_tipo_hash_uq
  on public.cobros_adjuntos (cobro_id, tipo, hash_sha256) where deleted_at is null;
