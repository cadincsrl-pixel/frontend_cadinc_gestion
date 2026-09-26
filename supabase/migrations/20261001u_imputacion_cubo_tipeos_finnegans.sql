-- Dos comprobantes que en Finnegans quedaron con el número mal tipeado y por eso no cruzaron en 20261001t
-- (se encontraron por fecha e importe exactos):
--   Supermat FA 00152-00001863 (04/09, $17.360.201,25 neto): en Finnegans «A-00512-00001863» → GERENCIAL, materiales.
--   FA 00025-00026345 (18/09, $393.458,75 neto): en Finnegans «A-00025-00036345» → CADINC, materiales.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
begin
  perform public.pagos_imputar_lote(array[784]::bigint[], 2, 'CC GERENCIA', u);
  perform public.pagos_imputar_lote(array[926]::bigint[], 2, 'CC CADINC', u);
end $m$;
