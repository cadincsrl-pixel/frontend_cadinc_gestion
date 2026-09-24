-- Ventas › Deudores: la antigüedad se cuenta desde la FECHA DE LA FACTURA, no
-- desde el vencimiento (24/09).
--
-- El dueño: «la fecha de vencimiento de las facturas emitidas creo que no me
-- sirven para nada… me figuran vencidas pero no me interesa eso». El
-- vencimiento de cobro sale de todas las pantallas de Ventas y Deudores pasa a
-- agrupar la deuda por días desde la emisión: hasta 30, 31–60, 61–90, más de 90.
--
-- Función NUEVA (no se reemplaza `ventas_deudores_al`): el backend en
-- producción sigue llamando a la vieja hasta que sale el deploy que usa esta,
-- así que no hay ventana rota. La vieja se borra en una migración posterior.
-- `ventas_saldos_al` no cambia: `vence_el` y `dias_vencido` siguen existiendo
-- (la FCE MiPyME informa su vencimiento de pago a ARCA), solo dejan de mostrarse.

create or replace function public.ventas_deudores_antiguedad_al(p_al date default null, p_ambiente text default null)
returns table(
  ambiente text, cliente_id bigint, cliente_razon_social text, cliente_doc_nro text,
  saldo numeric, a_cuenta numeric, nc_disponible numeric, saldo_neto numeric,
  d0_30 numeric, d31_60 numeric, d61_90 numeric, d90_mas numeric,
  saldo_a_revisar numeric, comprobantes integer, ultima_cobranza date, ultima_cobranza_total numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with prm as (select coalesce(p_al, public.hoy_ar()) as corte),
s as (
  select x.*, case when x.naturaleza = 'debito' then (select corte from prm) - x.fecha end as dias
    from public.ventas_saldos_al(p_al, null, p_ambiente) x),
agg as (
  select s.ambiente, s.cliente_id,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito'), 0) as saldo,
         coalesce(sum(s.saldo) filter (where s.origen = 'cobro'), 0) as a_cuenta,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'credito' and s.origen <> 'cobro'), 0) as nc_disponible,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias <= 30), 0) as d0_30,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias between 31 and 60), 0) as d31_60,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias between 61 and 90), 0) as d61_90,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias > 90), 0) as d90_mas,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.saldo_a_revisar), 0) as saldo_a_revisar,
         count(*) filter (where s.naturaleza = 'debito' and s.saldo > 0)::int as comprobantes
    from s group by s.ambiente, s.cliente_id)
select a.ambiente, a.cliente_id, c.razon_social, c.doc_nro,
       a.saldo, a.a_cuenta, a.nc_disponible, (a.saldo - a.a_cuenta - a.nc_disponible)::numeric(14,2),
       a.d0_30, a.d31_60, a.d61_90, a.d90_mas,
       a.saldo_a_revisar, a.comprobantes, u.fecha, u.total
  from agg a
  join public.ventas_clientes c on c.id = a.cliente_id
  left join lateral (
    select k.fecha, k.total from public.ventas_cobros k
     where k.cliente_id = a.cliente_id and k.ambiente = a.ambiente and k.estado = 'vigente'
       and (p_al is null or k.fecha <= p_al)
     order by k.fecha desc, k.id desc limit 1) u on true
 where a.saldo > 0 or a.a_cuenta > 0 or a.nc_disponible > 0
$function$;

revoke all on function public.ventas_deudores_antiguedad_al(date, text) from public, anon, authenticated;
grant execute on function public.ventas_deudores_antiguedad_al(date, text) to service_role;
