-- =====================================================================
-- 20261009a — Compras: las facturas de débito automático se pagan solas
-- (2026-09-26, dueño: «no me pongas ni sancor ni la segunda para pagar»;
-- 20260930z las cerró a mano, esto hace lo mismo con las que lleguen)
--
-- Un proveedor con forma habitual `debito_automatico` y una cuenta de
-- débito (`pagos_proveedores.debito_cuenta_id`, tesorería) no se paga a
-- mano: el banco le debita. Cuando una factura suya queda IMPUTADA (al
-- cargarla a mano, o al imputar la que trajo el importador de ARCA):
--   1. se aprueba sola (aprobada_por = quien la dejó imputada);
--   2. primero se le aplica el crédito de sus notas de crédito aprobadas
--      (lo que el banco realmente debita es factura − NC);
--   3. el resto se paga con una OP `debito_automatico` desde esa cuenta, con
--      la fecha de la factura (nunca futura).
-- Las NC de esos proveedores se aprueban solas al imputarse y quedan como
-- crédito para la próxima factura.
--
-- La doble firma no aplica: la plata ya la movió el banco, el control es la
-- conciliación con el extracto. Se aprueba escribiendo como pagos_aprobar_
-- factura (con cadinc.pagos_aprobar) y se paga con _pagos_emitir_orden sin
-- exigir aprobación y con cadinc.pagos_reconstruir (no pide CBU).
-- No toca facturas `pago_a_reconstruir`, `paga_cliente`, observadas ni las
-- que ya estaban pagadas. Corre en un constraint trigger DIFERIDO: al
-- commit, cuando la factura ya tiene su reparto.
-- Sancor (56) y La Segunda (49) quedan con Banco Galicia (tesorería 1).
-- =====================================================================

alter table public.pagos_proveedores
  add column debito_cuenta_id bigint references public.tesoreria_cuentas(id);

comment on column public.pagos_proveedores.debito_cuenta_id is
  'Cuenta de tesorería de la que el banco debita a este proveedor. Con forma habitual debito_automatico, sus facturas se pagan solas al imputarse (20261009a).';

update public.pagos_proveedores set debito_cuenta_id = 1
 where id in (56, 49) and forma_pago_habitual = 'debito_automatico';

-- La vista del padrón suma la columna al final (create or replace view solo agrega al final).
do $v$
declare
  v_def text := pg_get_viewdef('public.v_pagos_proveedores'::regclass, true);
begin
  if position('debito_cuenta_id' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, E'\n   FROM pagos_proveedores p', ''))) / length(E'\n   FROM pagos_proveedores p') <> 1 then
      raise exception 'ANCLA_VISTA_NO_UNICA';
    end if;
    execute 'create or replace view public.v_pagos_proveedores as '
         || replace(rtrim(v_def, ';'), E'\n   FROM pagos_proveedores p', E',\n    p.debito_cuenta_id\n   FROM pagos_proveedores p');
  end if;
end $v$;

create or replace function public._pagos_debito_automatico(p_factura_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $$
declare
  v_f      pagos_facturas%rowtype;
  v_prov   pagos_proveedores%rowtype;
  v_user   uuid;
  v_saldo  numeric(14,2);
  v_cap    numeric(14,2);
  nc       record;
begin
  select * into v_f from pagos_facturas where id = p_factura_id;
  if not found or v_f.sin_imputar or v_f.paga_cliente or v_f.estado not in ('pendiente', 'aprobada') then
    return;
  end if;
  select * into v_prov from pagos_proveedores where id = v_f.proveedor_id;
  if v_prov.forma_pago_habitual is distinct from 'debito_automatico' or v_prov.debito_cuenta_id is null or not v_prov.activo then
    return;
  end if;
  if coalesce((select v.pago_a_reconstruir from v_pagos_facturas v where v.id = p_factura_id), false) then
    return;
  end if;
  v_user := coalesce(v_f.updated_by, v_f.created_by);
  if v_user is null then
    return;
  end if;

  -- 1. Aprobación (la misma escritura que pagos_aprobar_factura).
  if v_f.estado = 'pendiente' then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update pagos_facturas
       set estado = 'aprobada', aprobada_por = v_user, aprobada_at = now(), updated_by = v_user
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
    perform _pagos_recalcular_estado(p_factura_id);
  end if;

  -- Una NC queda como crédito para la próxima factura.
  if v_f.clase <> 'factura' then
    return;
  end if;

  -- 2. Crédito de NC aprobadas del mismo proveedor, de la más vieja a la más nueva.
  for nc in
    select v.id, v.nc_disponible
      from v_pagos_facturas v
     where v.proveedor_id = v_f.proveedor_id and v.clase = 'nota_credito'
       and v.estado <> 'anulada' and v.aprobada_at is not null and v.nc_disponible > 0.005
     order by v.fecha, v.id
  loop
    select saldo_pagable into v_saldo from v_pagos_facturas where id = p_factura_id;
    exit when coalesce(v_saldo, 0) <= 0.005;
    v_cap := least(nc.nc_disponible, v_saldo);
    perform pagos_aplicar_nc(nc.id, jsonb_build_array(jsonb_build_object('factura_id', p_factura_id, 'monto', v_cap)), v_user);
  end loop;

  -- 3. El resto, con una OP de débito automático.
  select saldo_pagable into v_saldo from v_pagos_facturas where id = p_factura_id;
  if coalesce(v_saldo, 0) > 0.005 then
    perform set_config('cadinc.pagos_reconstruir', 'on', true);
    perform _pagos_emitir_orden(
      v_f.proveedor_id,
      jsonb_build_object(
        'fecha',            least(v_f.fecha, hoy_ar()),
        'forma_pago',       'debito_automatico',
        'cuenta_origen_id', v_prov.debito_cuenta_id,
        'monto_pagado',     v_saldo,
        'referencia',       format('Débito automático — %s %s', v_f.tipo_comprobante, coalesce(v_f.numero, 's/n')),
        'obs',              'Pagada sola al imputarse: el proveedor cobra por débito automático (20261009a).'),
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', p_factura_id, 'monto', v_saldo)),
      '[]'::jsonb, v_user, false);
    perform set_config('cadinc.pagos_reconstruir', 'off', true);
  end if;
end $$;

comment on function public._pagos_debito_automatico(bigint) is
  'Aprueba y paga sola (OP débito automático, aplicando antes el crédito de NC) una factura imputada de un proveedor que cobra por débito automático. 20261009a.';

revoke all on function public._pagos_debito_automatico(bigint) from public, anon, authenticated;

create or replace function public.fn_pagos_debito_automatico()
 returns trigger
 language plpgsql
 set search_path = public, pg_temp
as $$
begin
  perform public._pagos_debito_automatico(new.id);
  return null;
end $$;

drop trigger if exists trg_pagos_debito_automatico on public.pagos_facturas;
create constraint trigger trg_pagos_debito_automatico
  after insert or update of sin_imputar, estado on public.pagos_facturas
  deferrable initially deferred
  for each row
  when (new.estado in ('pendiente', 'aprobada') and not new.sin_imputar)
  execute function public.fn_pagos_debito_automatico();
