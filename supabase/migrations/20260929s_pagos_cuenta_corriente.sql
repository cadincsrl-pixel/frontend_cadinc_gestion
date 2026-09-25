-- =====================================================================
-- Compras › Cuentas: la cuenta corriente con un proveedor
-- (2026-09-25, serie 20260929)
--
-- Por qué: al conciliar Voltaje (su listado decía $134.112,75) no había
-- dónde ver la cuenta con un proveedor como la ve él: movimientos por fecha,
-- debe / haber y saldo. Deuda por proveedor da solo el saldo de hoy. Pedido
-- del dueño el 25/09; eligió una pestaña propia en Compras («Cuentas»).
--
-- pagos_cuenta_corriente(proveedor, desde, hasta) → jsonb:
--   · DEBE: facturas y notas de débito (clase 'factura'), por su total.
--   · HABER: notas de crédito (por su total, a su fecha) y órdenes de pago
--     emitidas (por monto_pagado, que incluye lo que fue «a cuenta»).
--   · Fuera: comprobantes y OPs ANULADOS, y las facturas que paga el cliente
--     (paga_cliente: no son deuda de CADINC).
--   · saldo_inicial = todo lo anterior a `desde`; el saldo corre por fila.
--     Saldo positivo = CADINC le debe al proveedor.
--   · Orden: fecha; el mismo día, primero el debe; después por id.
--   · Cada fila dice si la factura sigue «a reconstruir» (flag efectivo) y si
--     la OP es un pago reconstruido, para leer la cuenta sabiendo qué falta.
-- Solo lectura. security definer + service_role: el backend aplica la guarda
-- (lectura de pagos + tab «cuentas»).
--
-- Tab «cuentas»: se agrega a quienes ya tienen la tab «pagos» en su lista
-- explícita (profiles y roles), al lado de «pagos». Sin lista = ya ven todo.
-- =====================================================================

create or replace function public.pagos_cuenta_corriente(
  p_proveedor_id bigint,
  p_desde        date,
  p_hasta        date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prov public.pagos_proveedores%rowtype;
  v_res  jsonb;
begin
  select * into v_prov from public.pagos_proveedores where id = p_proveedor_id;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;

  with cc as (
    select f.fecha,
           case when f.clase = 'nota_credito' then 'nota_credito'
                when f.cbte_tipo_arca in (2, 7, 12, 52, 202, 207, 212) then 'nota_debito'
                else 'factura' end                                      as tipo,
           f.id                                                         as ref_id,
           btrim(coalesce(f.tipo_comprobante, '') || ' ' || coalesce(f.numero, 's/n')) as comprobante,
           coalesce(nullif(btrim(f.descripcion), ''), '')               as detalle,
           case when f.clase = 'nota_credito' then 0 else f.total end    as debe,
           case when f.clase = 'nota_credito' then f.total else 0 end    as haber,
           f.estado                                                     as estado,
           coalesce(v.pago_a_reconstruir, false)                        as a_reconstruir,
           false                                                        as reconstruida,
           case when f.clase = 'nota_credito' then 1 else 0 end          as orden_dia,
           f.id * 10                                                    as orden_id
      from public.pagos_facturas f
      left join public.v_pagos_facturas v on v.id = f.id
     where f.proveedor_id = p_proveedor_id
       and f.estado <> 'anulada'
       and not f.paga_cliente
    union all
    select o.fecha,
           'pago',
           o.id,
           'OP-' || lpad(o.numero::text, 4, '0'),
           btrim(
             case o.forma_pago
               when 'transferencia' then 'Transferencia'
               when 'cheque' then 'Cheque'
               when 'echeq' then 'Echeq'
               when 'efectivo' then 'Efectivo'
               when 'tarjeta' then 'Tarjeta'
               when 'debito_automatico' then 'Débito automático'
               else 'Otro' end
             || coalesce(' · ' || nullif(btrim(o.referencia), ''), '')
             || coalesce(' · paga ' || (select string_agg(coalesce(ff.numero, 's/n'), ', ' order by ff.fecha, ff.id)
                                          from public.pagos_orden_lineas l
                                          join public.pagos_facturas ff on ff.id = l.factura_id
                                         where l.orden_id = o.id and l.tipo = 'factura'), '')
             || case when exists (select 1 from public.pagos_orden_lineas l where l.orden_id = o.id and l.tipo = 'a_cuenta')
                     then ' · con parte a cuenta' else '' end),
           0,
           o.monto_pagado,
           o.estado,
           false,
           o.reconstruida,
           1,
           o.id * 10 + 1
      from public.pagos_ordenes o
     where o.proveedor_id = p_proveedor_id
       and o.estado = 'emitida'
       and o.monto_pagado > 0
  ),
  ini as (select coalesce(sum(debe - haber), 0)::numeric(14,2) as v from cc where fecha < p_desde),
  rango as (
    select c.*,
           ((select v from ini) + sum(c.debe - c.haber) over (order by c.fecha, c.orden_dia, c.orden_id
                                                          rows between unbounded preceding and current row))::numeric(14,2) as saldo
      from cc c
     where c.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
           'proveedor', jsonb_build_object('id', v_prov.id, 'razon_social', v_prov.razon_social, 'cuit', v_prov.cuit, 'codigo', v_prov.codigo),
           'desde', p_desde, 'hasta', p_hasta,
           'saldo_inicial', (select v from ini),
           'movimientos', coalesce((select jsonb_agg(jsonb_build_object(
                'fecha', r.fecha, 'tipo', r.tipo, 'ref_id', r.ref_id, 'comprobante', r.comprobante,
                'detalle', r.detalle, 'debe', r.debe, 'haber', r.haber, 'saldo', r.saldo,
                'estado', r.estado, 'a_reconstruir', r.a_reconstruir, 'reconstruida', r.reconstruida)
                order by r.fecha, r.orden_dia, r.orden_id) from rango r), '[]'::jsonb),
           'total_debe', (select coalesce(sum(debe), 0)::numeric(14,2) from rango),
           'total_haber', (select coalesce(sum(haber), 0)::numeric(14,2) from rango),
           'saldo_final', ((select v from ini) + (select coalesce(sum(debe - haber), 0) from rango))::numeric(14,2),
           'a_reconstruir', coalesce((select sum(v.saldo) from public.v_pagos_facturas v
                                       where v.proveedor_id = p_proveedor_id and v.pago_a_reconstruir and v.clase = 'factura'), 0))
    into v_res;
  return v_res;
end $$;

comment on function public.pagos_cuenta_corriente(bigint, date, date) is
  'Cuenta corriente con un proveedor entre dos fechas: saldo inicial, movimientos (facturas/ND al debe; NC y OPs emitidas al haber) con saldo corrido y totales. Sin anulados ni facturas que paga el cliente. Solo lectura. 20260929s.';

revoke all on function public.pagos_cuenta_corriente(bigint, date, date) from public, anon, authenticated;
grant execute on function public.pagos_cuenta_corriente(bigint, date, date) to service_role;

-- ── Tab «cuentas» al lado de «pagos» ─────────────────────────────────────
create or replace function pg_temp._con_cuentas(p jsonb) returns jsonb language sql immutable as $f$
  select case
    when p -> 'pagos' -> 'tabs' is null or jsonb_typeof(p -> 'pagos' -> 'tabs') <> 'array' then p
    when (p -> 'pagos' -> 'tabs') ? 'cuentas' or not ((p -> 'pagos' -> 'tabs') ? 'pagos') then p
    else jsonb_set(p, '{pagos,tabs}',
           (select jsonb_agg(x order by o) from (
              select t.x, t.o::numeric as o from jsonb_array_elements(p -> 'pagos' -> 'tabs') with ordinality t(x, o)
              union all
              select to_jsonb('cuentas'::text), (select o from jsonb_array_elements_text(p -> 'pagos' -> 'tabs') with ordinality e(v, o) where v = 'pagos') + 0.5
            ) s))
  end
$f$;

update public.profiles set permisos = pg_temp._con_cuentas(permisos)
 where permisos -> 'pagos' -> 'tabs' ? 'pagos' and not (permisos -> 'pagos' -> 'tabs' ? 'cuentas');
update public.roles set permisos = pg_temp._con_cuentas(permisos)
 where permisos -> 'pagos' -> 'tabs' ? 'pagos' and not (permisos -> 'pagos' -> 'tabs' ? 'cuentas');
