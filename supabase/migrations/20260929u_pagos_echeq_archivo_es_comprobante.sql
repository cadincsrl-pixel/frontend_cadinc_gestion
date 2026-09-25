-- =====================================================================
-- Compras: en un E-CHEQ, el archivo de cada echeq ES el comprobante
-- (2026-09-25, pedido del dueño)
--
-- Por qué: con forma «echeq» el PDF/foto de cada echeq que se sube en la OP
-- (adjunto tipo 'cheque', vía cheques[].foto_path, 20260925p) ya es la
-- constancia del pago, y además se exigía un comprobante aparte
-- (COMPROBANTE_REQUERIDO para transferencia y echeq). Se subía dos veces lo
-- mismo.
--
-- Regla nueva (_pagos_emitir_orden, parche por ancla sobre la definición
-- viva):
--   · echeq: si TODOS los cheques traen `foto_path` y ese path está entre los
--     adjuntos de la OP, el comprobante aparte es OPCIONAL. Si alguno no
--     trae archivo y no hay comprobante, sigue COMPROBANTE_REQUERIDO, ahora
--     con `cheques_sin_archivo` (los números) en el detalle.
--   · transferencia: igual que siempre (comprobante obligatorio).
--   · cheque físico: igual que siempre (no lo pide).
--   · Pago reconstruido (cadinc.pagos_reconstruir): igual que siempre.
-- El backend deja de sacar `foto_path` de cada cheque antes de la RPC (ya
-- resuelto contra el dedupe de adjuntos); la RPC sólo lo MIRA: pagos_cheques
-- no tiene esa columna y el insert no la toca. Espejo: comprobanteFaltante()
-- del backend y comprobanteObligatorio() del frontend.
-- =====================================================================

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
$a$  v_cta_origen  bigint;
$a$,
$a$  v_cta_origen  bigint;
  v_sin_archivo jsonb;
$a$);
  v := pg_temp._una(v,
$a$  if v_forma in ('transferencia', 'echeq') and not v_reconstruir
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')::text;$a$,
$a$  -- E-cheq (20260929u): el archivo de CADA echeq es el comprobante. Los que
  -- no traen foto_path (o cuyo path no está entre los adjuntos) quedan acá.
  v_sin_archivo := case when v_forma = 'echeq' then coalesce((
      select jsonb_agg(ch -> 'numero') from jsonb_array_elements(v_cheques) ch
       where coalesce(btrim(ch ->> 'foto_path'), '') = ''
          or not exists (select 1 from jsonb_array_elements(v_adjuntos) e
                          where e ->> 'storage_path' = btrim(ch ->> 'foto_path'))), '[]'::jsonb) end;
  if v_forma in ('transferencia', 'echeq') and not v_reconstruir
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago')
     and not (v_forma = 'echeq' and jsonb_array_length(v_cheques) > 0 and jsonb_array_length(v_sin_archivo) = 0) then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = (jsonb_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')
                || case when v_forma = 'echeq' then jsonb_build_object('cheques_sin_archivo', v_sin_archivo) else '{}'::jsonb end)::text;$a$);
  execute v;
end $m$;
