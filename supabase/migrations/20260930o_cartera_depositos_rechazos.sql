-- =====================================================================
-- Cartera de cheques recibidos, fase 4a: depositar, rechazar, recuperar
-- (2026-09-25, serie 20260930)
--
-- Los estados operativos del cheque, SIN asiento todavía (fase 4b, con el
-- contador: hoy los cobros de Logística no se contabilizan, así que la
-- cuenta Valores a depositar no recibe los cheques de Casilda aunque el
-- endoso sí los acredita; contabilizar el depósito ahora la dejaría más
-- negativa). Diseño en Obsidian: Proyectos/Cartera de cheques recibidos.
--
-- Transiciones (única puerta: cheques_recibidos_cambiar_estado):
--   depositar        en_cartera            → depositado  (cuenta de tesorería
--                    banco/billetera + fecha; sin fecha = la de cobro de cada
--                    cheque, para marcar en lote los vencidos)
--   rechazar         depositado | endosado → rechazado   (fecha + motivo; el
--                    endosado conserva su OP: el dueño emite otro cheque al
--                    proveedor y este vuelve a la cartera hasta que lo paguen)
--   recuperar        rechazado             → recuperado  (fecha + con qué lo
--                    pagaron)
--   volver_a_cartera depositado | rechazado | recuperado → en_cartera o, si
--                    tiene OP, endosado (deshacer)
-- =====================================================================

alter table public.cheques_recibidos
  add column deposito_tesoreria_id bigint references public.tesoreria_cuentas(id),
  add column fecha_deposito        date,
  add column rechazo_fecha         date,
  add column rechazo_motivo        text,
  add column recupero_fecha        date,
  add column recupero_obs          text;

create or replace function public.cheques_recibidos_cambiar_estado(
  p_ids          bigint[],
  p_accion       text,
  p_fecha        date,
  p_tesoreria_id bigint,
  p_motivo       text,
  p_user_id      uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_malos  text[];
  v_n      int;
  v_tipo   text;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'SIN_CHEQUES' using errcode = 'P0001';
  end if;
  if p_accion not in ('depositar', 'rechazar', 'recuperar', 'volver_a_cartera') then
    raise exception 'ACCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('accion', p_accion)::text;
  end if;

  -- Los que no pueden hacer esa transición, por número.
  select array_agg(numero order by numero) into v_malos
    from public.cheques_recibidos
   where id = any(p_ids)
     and not (case p_accion
                when 'depositar'        then estado = 'en_cartera'
                when 'rechazar'         then estado in ('depositado', 'endosado')
                when 'recuperar'        then estado = 'rechazado'
                when 'volver_a_cartera' then estado in ('depositado', 'rechazado', 'recuperado')
              end);
  if v_malos is not null then
    raise exception 'TRANSICION_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('accion', p_accion, 'cheques', v_malos)::text;
  end if;

  if p_accion = 'depositar' then
    select tipo into v_tipo from public.tesoreria_cuentas where id = p_tesoreria_id and activo;
    if v_tipo is null or v_tipo not in ('banco', 'billetera') then
      raise exception 'CUENTA_DEPOSITO_INVALIDA' using errcode = 'P0001', detail = json_build_object('tesoreria_id', p_tesoreria_id)::text;
    end if;
    update public.cheques_recibidos
       set estado = 'depositado', deposito_tesoreria_id = p_tesoreria_id,
           fecha_deposito = coalesce(p_fecha, fecha_cobro, current_date),
           updated_at = now(), updated_by = p_user_id
     where id = any(p_ids);
  elsif p_accion = 'rechazar' then
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001'; end if;
    update public.cheques_recibidos
       set estado = 'rechazado', rechazo_fecha = coalesce(p_fecha, current_date), rechazo_motivo = btrim(p_motivo),
           updated_at = now(), updated_by = p_user_id
     where id = any(p_ids);
  elsif p_accion = 'recuperar' then
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001'; end if;
    update public.cheques_recibidos
       set estado = 'recuperado', recupero_fecha = coalesce(p_fecha, current_date), recupero_obs = btrim(p_motivo),
           updated_at = now(), updated_by = p_user_id
     where id = any(p_ids);
  else
    -- Deshacer: vuelve a donde estaba antes (endosado si tiene OP vigente).
    update public.cheques_recibidos r
       set estado = case when r.pagos_cheque_id is not null then 'endosado' else 'en_cartera' end,
           deposito_tesoreria_id = null, fecha_deposito = null,
           rechazo_fecha = null, rechazo_motivo = null, recupero_fecha = null, recupero_obs = null,
           updated_at = now(), updated_by = p_user_id
     where id = any(p_ids);
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('accion', p_accion, 'cheques', v_n);
end $$;

comment on function public.cheques_recibidos_cambiar_estado(bigint[], text, date, bigint, text, uuid) is
  'Depositar / rechazar / recuperar / volver a cartera cheques de la cartera, validando la transición. Sin asiento (fase 4b). 20260930o.';

revoke all on function public.cheques_recibidos_cambiar_estado(bigint[], text, date, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.cheques_recibidos_cambiar_estado(bigint[], text, date, bigint, text, uuid) to service_role;

-- La vista suma lo del depósito y el rechazo (al final: create or replace
-- view sólo agrega columnas al final).
create or replace view public.v_cheques_recibidos as
select r.id, r.numero, r.numero_norm, r.banco, r.librador, r.librador_cuit, r.fecha_cobro, r.importe, r.es_echeq,
       r.origen, r.estado, r.obs, r.created_at, r.updated_at,
       r.cobro_id, r.cobro_adjunto_id, r.ventas_cobro_medio_id, r.pagos_cheque_id,
       et.nombre                                   as empresa_nombre,
       vc.id                                       as ventas_cobro_id,
       vcl.razon_social                            as cliente_nombre,
       coalesce(et.nombre, vcl.razon_social)       as recibido_de,
       coalesce(c.cobrado_en, vc.fecha)            as recibido_el,
       o.id                                        as orden_id,
       o.numero                                    as op_numero,
       o.fecha                                     as op_fecha,
       pp.id                                       as proveedor_id,
       pp.razon_social                             as proveedor_nombre,
       (r.estado = 'en_cartera' and r.fecha_cobro < current_date) as vencido,
       public.norm_txt(concat_ws(' ', r.numero, r.banco, r.librador, r.librador_cuit, et.nombre, vcl.razon_social, pp.razon_social,
                                 'OP-' || lpad(o.numero::text, 4, '0'))) as busq,
       r.deposito_tesoreria_id,
       tc.nombre                                   as deposito_cuenta,
       r.fecha_deposito,
       r.rechazo_fecha,
       r.rechazo_motivo,
       r.recupero_fecha,
       r.recupero_obs
  from public.cheques_recibidos r
  left join public.cobros c                  on c.id = r.cobro_id
  left join public.empresas_transportistas et on et.id = c.empresa_id
  left join public.ventas_cobro_medios vm    on vm.id = r.ventas_cobro_medio_id
  left join public.ventas_cobros vc          on vc.id = vm.cobro_id
  left join public.ventas_clientes vcl       on vcl.id = vc.cliente_id
  left join public.pagos_cheques pc          on pc.id = r.pagos_cheque_id
  left join public.pagos_ordenes o           on o.id = pc.orden_id
  left join public.pagos_proveedores pp      on pp.id = o.proveedor_id
  left join public.tesoreria_cuentas tc      on tc.id = r.deposito_tesoreria_id;
