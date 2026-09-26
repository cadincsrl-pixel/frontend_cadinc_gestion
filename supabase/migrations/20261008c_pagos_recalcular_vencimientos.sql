-- Compras: recalcular el vencimiento de las facturas impagas de un proveedor
-- con su regla actual (27/09/2026).
--
-- Cambiar «Cómo vence» en la ficha del proveedor solo afecta a las facturas
-- nuevas. Para el grupo Silva hubo que recalcular por SQL las 44 impagas
-- (20261008b); regla del dueño: lo que se hace por terminal tiene que quedar
-- en el ERP. Esta es la puerta: Compras › Proveedores › ficha › «Recalcular
-- vencimientos», con vista previa (p_aplicar = false) y después aplicar.
--
-- Alcance: facturas (no NC) del proveedor en pendiente / observada / aprobada /
-- pagada_parcial, que no estén marcadas «pago a reconstruir». El vencimiento
-- nuevo sale de _pagos_prevision_pago, el mismo cálculo del importador.

create or replace function public.pagos_recalcular_vencimientos(p_proveedor_id bigint, p_aplicar boolean, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lista jsonb;
  v_n     int;
begin
  if p_user_id is null then
    raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pagos_proveedores where id = p_proveedor_id) then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_proveedor_id)::text;
  end if;

  with c as (
    select f.id, f.numero, f.fecha, f.vence_el as antes,
           (public._pagos_prevision_pago(f.proveedor_id, f.fecha, f.clase, f.tipo_comprobante) ->> 'vence_el')::date as despues
      from public.pagos_facturas f
     where f.proveedor_id = p_proveedor_id
       and f.clase = 'factura'
       and f.estado in ('pendiente', 'observada', 'aprobada', 'pagada_parcial')
       and not coalesce(f.pago_a_reconstruir, false)
       and f.fecha is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'fecha', fecha, 'antes', antes, 'despues', despues)
                  order by fecha, id), '[]'::jsonb), count(*)
    into v_lista, v_n
    from c
   where despues is not null and antes is distinct from despues;

  if p_aplicar and v_n > 0 then
    update public.pagos_facturas f
       set vence_el = (x ->> 'despues')::date, updated_by = p_user_id
      from jsonb_array_elements(v_lista) x
     where f.id = (x ->> 'id')::bigint;
  end if;

  return jsonb_build_object('aplicado', p_aplicar and v_n > 0, 'cambian', v_n, 'facturas', v_lista);
end $function$;

revoke all on function public.pagos_recalcular_vencimientos(bigint, boolean, uuid) from public, anon, authenticated;
grant execute on function public.pagos_recalcular_vencimientos(bigint, boolean, uuid) to service_role;
