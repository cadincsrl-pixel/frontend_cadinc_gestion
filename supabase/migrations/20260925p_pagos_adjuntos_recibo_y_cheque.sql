-- =====================================================================
-- Compras: adjuntos de la OP tipo 'recibo_proveedor' y 'cheque' (2026-09-25)
--
-- Por qué: el proveedor a veces manda un recibo por lo que se le pagó y no
-- había dónde colgarlo; y los cheques físicos se fotografían (la IA los lee)
-- y esa foto queda adjunta a la OP. Dos tipos nuevos de adjunto.
--
-- 1) CHECK de pagos_ordenes_adjuntos.tipo: suma los dos tipos.
-- 2) _pagos_emitir_orden valida p_adjuntos contra su PROPIA lista
--    ('comprobante_pago','nota_credito','otro'); sin tocarla, emitir una
--    OP con la foto de un cheque rebotaría con ADJUNTO_INVALIDO. Se
--    reescribe solo esa lista, con la definición VIVA + reemplazo contado
--    (si el ancla no aparece exactamente una vez, falla todo). Misma firma,
--    mismos grants (create or replace los conserva).
--    COMPROBANTE_REQUERIDO no cambia: la foto del cheque no reemplaza al
--    comprobante de la transferencia/echeq.
-- =====================================================================

alter table public.pagos_ordenes_adjuntos
  drop constraint pagos_ordenes_adjuntos_tipo_check;
alter table public.pagos_ordenes_adjuntos
  add constraint pagos_ordenes_adjuntos_tipo_check
  check (tipo = any (array['comprobante_pago','nota_credito','otro','recibo_proveedor','cheque']));

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

do $m$
declare
  v text := pg_get_functiondef('public._pagos_emitir_orden(bigint,jsonb,jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$not in ('comprobante_pago', 'nota_credito', 'otro')$a$,
$a$not in ('comprobante_pago', 'nota_credito', 'otro', 'recibo_proveedor', 'cheque')$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
