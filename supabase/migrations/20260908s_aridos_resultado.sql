-- Bucket de comprobantes de gastos + la vista que cruza ingresos con egresos.
--
-- Por qué un bucket propio y no `aridos-docs`: ahí viven los papeles del
-- vehículo (VTV, seguro, título), que son permanentes y se consultan por
-- vencimiento. Un ticket de gasoil es un comprobante de una transacción. Es la
-- misma separación que ya existe en logística entre `vehiculo-docs` y
-- `gastos-logistica`, y evita que un borrado de gastos toque documentación.
insert into storage.buckets (id, name, public)
values ('gastos-aridos', 'gastos-aridos', false)
on conflict (id) do nothing;

-- ── El resultado del mes ──────────────────────────────────────────────
-- Lo que el dueño pidió: "medir ingresos contra egresos" por camión.
--
-- Las cuatro fuentes se unen en formato largo y se agregan al final, en vez de
-- hacer cuatro joins: una venta y un gasto no comparten clave, y un FULL JOIN
-- entre agregados se rompe apenas un mes tiene gastos y no ventas (o al revés),
-- que es justo el caso de un camión parado en el taller.
--
-- `unidad_id` NULL es un renglón real, no un error: un seguro anual del área o
-- una venta con flete del cliente no son de ningún camión. Se muestra aparte
-- en vez de repartirse con una regla inventada.
create or replace view public.v_aridos_resultado_mes as
with base as (
  -- Venta: trae el ingreso Y el costo del material que cobra la cantera.
  select date_trunc('month', m.fecha)::date as mes,
         m.unidad_id,
         coalesce(m.importe, 0)     as ingresos,
         coalesce(m.costo_total, 0) as costo_material,
         0::numeric                 as gastos,
         0::numeric                 as mano_obra,
         0::numeric                 as costo_acopio
    from public.aridos_movimientos m
   where m.tipo = 'venta'

  union all

  -- Acopio: material comprado a stock. Es plata que salió, pero NO es costo de
  -- este mes — se convierte en costo cuando se vende. Va en su propia columna
  -- para que se vea sin ensuciar el margen.
  select date_trunc('month', m.fecha)::date, m.unidad_id,
         0, 0, 0, 0, coalesce(m.costo_total, 0)
    from public.aridos_movimientos m
   where m.tipo = 'acopio'

  union all

  select date_trunc('month', g.fecha)::date, g.unidad_id,
         0, 0, g.monto, 0, 0
    from public.aridos_gastos g
   where g.deleted_at is null

  union all

  -- La paga del chofer con el jornal congelado en el día; si falta, el vigente
  -- a esa fecha. Ver `v_aridos_chofer_pago_mes` para el detalle por chofer.
  select date_trunc('month', d.fecha)::date, d.unidad_id,
         0, 0, 0, coalesce(d.jornal_aplicado, j.jornal, 0), 0
    from public.aridos_chofer_dias d
    left join lateral (
      select jj.jornal from public.aridos_chofer_jornales jj
       where jj.chofer_id = d.chofer_id and jj.vigente_desde <= d.fecha
       order by jj.vigente_desde desc limit 1
    ) j on true
   where d.deleted_at is null
)
select b.mes,
       b.unidad_id,
       coalesce(u.nombre, 'Del área (sin camión)') as unidad,
       u.patente,
       sum(b.ingresos)       as ingresos,
       sum(b.costo_material) as costo_material,
       sum(b.gastos)         as gastos,
       sum(b.mano_obra)      as mano_obra,
       sum(b.costo_acopio)   as costo_acopio,
       sum(b.ingresos) - sum(b.costo_material) - sum(b.gastos) - sum(b.mano_obra) as resultado
  from base b
  left join public.aridos_unidades u on u.id = b.unidad_id
 group by b.mes, b.unidad_id, u.nombre, u.patente;

alter view public.v_aridos_resultado_mes set (security_invoker = on);

comment on view public.v_aridos_resultado_mes is
  'Resultado mensual de aridos por camion: ingresos de ventas menos material de cantera, gastos y jornales de choferes. costo_acopio queda AFUERA del resultado (es compra a stock, se vuelve costo al vender). unidad_id NULL = del area, no de un camion.';
