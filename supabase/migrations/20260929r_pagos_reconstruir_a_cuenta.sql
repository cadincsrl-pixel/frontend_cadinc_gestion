-- =====================================================================
-- Compras: el pago reconstruido admite una parte «a cuenta»
-- (2026-09-25, serie 20260929)
--
-- Por qué: en la compra a León Alperovich la transferencia del 21/08
-- ($23.464.405,86) pagó $34.000,94 más de lo que suman las facturas. El
-- dueño decidió dejarlo en la cuenta corriente del proveedor (saldo a favor).
-- pagos_reconstruir_orden (20260929l) solo aceptaba líneas «factura».
--
-- Cambio: acepta también líneas «a_cuenta» (sin factura), que _pagos_emitir_orden
-- ya sabía registrar. Las líneas «factura» siguen exigiendo el flag efectivo
-- pago_a_reconstruir. Tiene que haber al menos una línea «factura»: un
-- anticipo suelto sigue yendo por la OP normal.
-- =====================================================================

create or replace function public.pagos_reconstruir_orden(
  p_proveedor_id bigint,
  p_orden        jsonb,
  p_lineas       jsonb,
  p_user_id      uuid
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_fac int := 0;
  l    record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_es_admin(p_user_id) and not public._pagos_flag(p_user_id, 'registrar_pagos', false) then
    raise exception 'SIN_PERMISO_REGISTRAR_PAGOS' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = 'P0001';
  end if;
  for l in select coalesce(x.tipo, 'factura') as tipo, x.factura_id
             from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint) loop
    if l.tipo = 'a_cuenta' then
      continue;  -- _pagos_emitir_orden valida que no traiga factura y que el monto sea > 0
    end if;
    if l.tipo <> 'factura' or l.factura_id is null then
      raise exception 'RECONSTRUIR_SOLO_FACTURAS' using errcode = 'P0001',
        detail = json_build_object('tipo', l.tipo, 'factura_id', l.factura_id)::text;
    end if;
    if not exists (select 1 from public.v_pagos_facturas f
                    where f.id = l.factura_id and f.proveedor_id = p_proveedor_id and f.pago_a_reconstruir) then
      raise exception 'FACTURA_NO_A_RECONSTRUIR' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id)::text;
    end if;
    v_fac := v_fac + 1;
  end loop;
  if v_fac = 0 then
    raise exception 'RECONSTRUIR_SOLO_FACTURAS' using errcode = 'P0001',
      detail = json_build_object('motivo', 'al menos una línea tiene que ser una factura')::text;
  end if;

  perform set_config('cadinc.pagos_reconstruir', 'on', true);
  v_id := public._pagos_emitir_orden(p_proveedor_id, p_orden, p_lineas, '[]'::jsonb, p_user_id, false);
  perform set_config('cadinc.pagos_reconstruir', '', true);
  return v_id;
end $$;
