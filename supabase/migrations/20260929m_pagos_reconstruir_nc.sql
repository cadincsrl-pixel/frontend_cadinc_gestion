-- =====================================================================
-- Compras: aplicar una NC «de meses ya pagados» a su factura
-- (2026-09-25, serie 20260929)
--
-- Por qué: el importador de ARCA trae las NC de proveedor pero no a qué
-- factura acreditan (el archivo no lo dice). Quedan sueltas y
-- pago_a_reconstruir, y no había salida:
--   · pagos_aplicar_nc exige la NC aprobada (NC_NO_APROBADA);
--   · pagos_aprobar_factura la rechaza por FACTURA_A_RECONSTRUIR mientras
--     tenga crédito sin aplicar, y además por FACTURA_SIN_IMPUTAR.
-- Caso que lo destapó: Leiten NOA FA 6-6463 $4.748.584,50 y su NC 6-681
-- $852.384,50 («Comp. de origen: 0006-00006463-A»); se pagaron $3.896.200 con
-- dos echeqs y la factura quedó con saldo igual a la NC. Hay 44 NC así
-- ($21,3M) en las importaciones de jul–sep.
--
-- Diseño: pagos_reconstruir_nc(nc, aplica_a, user), una transacción:
--   1) NC y facturas con el flag EFECTIVO pago_a_reconstruir, mismo proveedor;
--   2) aplica por la única puerta (_pagos_guardar_aplicaciones, agregando);
--   3) aprueba la NC igual que pagos_aprobar_factura (GUC cadinc.pagos_aprobar,
--      estado/aprobada_por/aprobada_at, _pagos_recalcular_estado): la reserva
--      pasa a crédito y la factura baja su saldo de verdad.
--   No pide imputación ni aplica doble firma: el crédito ya se usó en la
--   realidad (igual criterio que pagos_reconstruir_orden, 20260929l).
--   Pide admin, aprobar_facturas o registrar_pagos (el mismo permiso que
--   POST /facturas/:id/aplicar-nc).
--   · pagos_facturas_sin_imputar_chk («sin imputar ⇒ pendiente y sin
--     aprobar») cede SOLO para NC pago_a_reconstruir: una NC no tiene reparto
--     propio que validar, acredita lo de su factura.
-- =====================================================================

alter table public.pagos_facturas drop constraint pagos_facturas_sin_imputar_chk;
alter table public.pagos_facturas add constraint pagos_facturas_sin_imputar_chk check (
  (not sin_imputar)
  or ((estado = any (array['pendiente','observada','anulada'])) and aprobada_at is null and not pagada_al_cargar and not paga_cliente)
  or (clase = 'nota_credito' and pago_a_reconstruir and not pagada_al_cargar and not paga_cliente));

create or replace function public.pagos_reconstruir_nc(
  p_nc_id    bigint,
  p_aplica_a jsonb,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nc public.pagos_facturas%rowtype;
  g    record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_es_admin(p_user_id)
     and not public._pagos_flag(p_user_id, 'aprobar_facturas', false)
     and not public._pagos_flag(p_user_id, 'registrar_pagos', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'aprobar_facturas|registrar_pagos')::text;
  end if;
  if p_aplica_a is null or jsonb_typeof(p_aplica_a) <> 'array' or jsonb_array_length(p_aplica_a) = 0 then
    raise exception 'NC_APLICACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
  end if;

  select * into v_nc from public.pagos_facturas where id = p_nc_id for update;
  if not found or v_nc.clase <> 'nota_credito' then
    raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  if not coalesce((select v.pago_a_reconstruir from public.v_pagos_facturas v where v.id = p_nc_id), false) then
    raise exception 'FACTURA_NO_A_RECONSTRUIR' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  for g in select distinct (e ->> 'factura_id')::bigint as factura_id from jsonb_array_elements(p_aplica_a) e loop
    if not exists (select 1 from public.v_pagos_facturas v
                    where v.id = g.factura_id and v.proveedor_id = v_nc.proveedor_id
                      and v.clase = 'factura' and v.pago_a_reconstruir) then
      raise exception 'FACTURA_NO_A_RECONSTRUIR' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
    end if;
  end loop;

  perform public._pagos_guardar_aplicaciones(p_nc_id, p_aplica_a, p_user_id, true);

  if v_nc.estado = 'pendiente' then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set estado = 'aprobada', aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_nc_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  end if;
  perform public._pagos_recalcular_estado(p_nc_id);

  return jsonb_build_object(
    'nc', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_nc_id),
    'facturas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.v_pagos_facturas v
                  where v.id in (select (e ->> 'factura_id')::bigint from jsonb_array_elements(p_aplica_a) e)));
end $$;

comment on function public.pagos_reconstruir_nc(bigint, jsonb, uuid) is
  'Aplica una NC pago_a_reconstruir a facturas pago_a_reconstruir del mismo proveedor y la aprueba en la misma transacción (sin imputación ni doble firma: el crédito ya se usó). 20260929m.';

revoke all on function public.pagos_reconstruir_nc(bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pagos_reconstruir_nc(bigint, jsonb, uuid) to service_role;
