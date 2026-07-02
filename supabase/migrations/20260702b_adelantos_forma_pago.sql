-- ═══════════════════════════════════════════════════════════════════
--  adelantos.forma_pago — transferencia | efectivo
-- ───────────────────────────────────────────────────────────────────
--  Al registrar un adelanto al chofer se elige cómo se pagó. Si es en
--  efectivo, la UI permite imprimir un recibo PDF para que el chofer
--  firme; el escaneo firmado se sube como `comprobante` (flujo existente,
--  bucket adelantos-logistica).
--
--  Default 'efectivo': es la forma más común de adelanto a chofer, y las
--  filas históricas quedan clasificadas ahí (sin dato preciso, es el
--  supuesto razonable). CHECK para que sea uno de los dos valores.
-- ═══════════════════════════════════════════════════════════════════

alter table public.adelantos
  add column if not exists forma_pago text not null default 'efectivo'
  check (forma_pago in ('transferencia', 'efectivo'));
