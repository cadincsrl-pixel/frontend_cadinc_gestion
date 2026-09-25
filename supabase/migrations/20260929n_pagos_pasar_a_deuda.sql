-- =====================================================================
-- Compras: «Es deuda: no se pagó» — sacar la marca pago_a_reconstruir
-- (2026-09-25, serie 20260929)
--
-- Por qué: el importador con «historica» marca TODO el archivo como ya
-- pagado. En septiembre el archivo llegó hasta el 24/09 y entraron como
-- pagadas facturas que se deben (la primera: Gimenez Hnos FA 7-3670 del
-- 24/09, $98.400, ya imputada y sin poder aprobarse). La marca era inmutable
-- (A_RECONSTRUIR_INMUTABLE) y no había salida.
--
-- Diseño:
--   · pagos_pasar_a_deuda(factura, user): solo con el flag EFECTIVO
--     pago_a_reconstruir y SIN nada registrado (ni pagos ni NC aplicadas: si
--     hay, era un pago parcial y se sigue reconstruyendo). Pide admin o
--     aprobar_facturas. Deja pago_a_reconstruir = false y anota
--     pasada_a_deuda_at / _por. Vale también para una NC (su crédito pasa a
--     estar disponible como el de cualquier NC pendiente).
--   · El guard deja cambiar la marca SOLO de true a false y SOLO con la GUC
--     cadinc.pagos_a_deuda, que prende esta función. Nadie la vuelve a true.
--   · Desde ahí la factura sigue el circuito normal: imputar si falta,
--     aprobar (doble firma) y pagar. Libro IVA y contabilidad no cambian.
-- =====================================================================

alter table public.pagos_facturas
  add column pasada_a_deuda_at  timestamptz,
  add column pasada_a_deuda_por uuid references auth.users(id);

comment on column public.pagos_facturas.pasada_a_deuda_at is
  'Se importó como «de meses ya pagados» pero no estaba pagada: se sacó la marca pago_a_reconstruir con pagos_pasar_a_deuda. 20260929n.';

create or replace function public.fn_pagos_a_reconstruir_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.pago_a_reconstruir and coalesce(current_setting('cadinc.pagos_importar', true), '') <> 'on' then
      raise exception 'A_RECONSTRUIR_SOLO_IMPORTADOR' using errcode = 'P0001';
    end if;
  elsif new.pago_a_reconstruir is distinct from old.pago_a_reconstruir then
    -- 20260929n: solo true → false y solo por pagos_pasar_a_deuda.
    if old.pago_a_reconstruir and not new.pago_a_reconstruir
       and coalesce(current_setting('cadinc.pagos_a_deuda', true), '') = 'on' then
      return new;
    end if;
    raise exception 'A_RECONSTRUIR_INMUTABLE' using errcode = 'P0001', detail = json_build_object('factura_id', old.id)::text;
  end if;
  return new;
end $$;

create or replace function public.pagos_pasar_a_deuda(p_factura_id bigint, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_f public.pagos_facturas%rowtype;
  v_v record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_es_admin(p_user_id) and not public._pagos_flag(p_user_id, 'aprobar_facturas', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'aprobar_facturas')::text;
  end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select v.pago_a_reconstruir, v.pagado, v.acreditado, v.nc_aplicado into v_v
    from public.v_pagos_facturas v where v.id = p_factura_id;
  if not coalesce(v_v.pago_a_reconstruir, false) then
    raise exception 'FACTURA_NO_A_RECONSTRUIR' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if coalesce(v_v.pagado, 0) > 0 or coalesce(v_v.acreditado, 0) > 0 or coalesce(v_v.nc_aplicado, 0) > 0 then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'pagado', v_v.pagado, 'acreditado', v_v.acreditado, 'nc_aplicado', v_v.nc_aplicado)::text;
  end if;

  perform set_config('cadinc.pagos_a_deuda', 'on', true);
  update public.pagos_facturas
     set pago_a_reconstruir = false, pasada_a_deuda_at = now(), pasada_a_deuda_por = p_user_id, updated_by = p_user_id
   where id = p_factura_id;
  perform set_config('cadinc.pagos_a_deuda', '', true);

  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $$;

comment on function public.pagos_pasar_a_deuda(bigint, uuid) is
  'Saca la marca pago_a_reconstruir de una importada que en realidad se debe: vuelve al circuito normal (aprobar y pagar). Solo sin pagos ni NC aplicadas; admin o aprobar_facturas. 20260929n.';

revoke all on function public.pagos_pasar_a_deuda(bigint, uuid) from public, anon, authenticated;
grant execute on function public.pagos_pasar_a_deuda(bigint, uuid) to service_role;
