-- =====================================================================
-- 20260928i — Contabilidad: Libro Diario resumido por día o por mes (2026-09-24)
--
-- Presentación, no crea asientos. Los asientos AUTOMÁTICOS confirmados se
-- agrupan por (circuito, período) en un asiento sintético con líneas
-- agregadas por cuenta y lado (debe por un lado, haber por otro, sin
-- netear; sin auxiliares ni obra). Manuales, ajuste, apertura y cierre van
-- siempre uno por uno. Los contraasientos automáticos entran en su
-- circuito (suman por lado, el grupo sigue cuadrando).
-- `orden` = posición correlativa en el libro (la numeración real del
-- cierre mezcla circuitos: el resumen informa el rango numero_desde/hasta).
-- Totales del rango: la misma consulta que cont_libro_diario.
-- =====================================================================

create or replace function public._cont_circuito(p_origen_tabla text)
returns text
language sql immutable
set search_path = public, pg_temp
as $function$
  select case p_origen_tabla
           when 'ventas_facturas' then 'ventas'
           when 'ventas_comprobantes_externos' then 'ventas'
           when 'ventas_cobros' then 'cobros'
           when 'pagos_facturas' then 'compras'
           when 'pagos_ordenes' then 'pagos'
           else 'otros' end
$function$;

comment on function public._cont_circuito(text) is
  'Circuito contable de una tabla de origen: ventas (facturas del ERP + externos), cobros, compras, pagos u otros (20260928i).';

create or replace function public.cont_libro_diario_resumido(
  p_desde date, p_hasta date, p_agrupar text default 'mes',
  p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_lim    int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off    int := greatest(coalesce(p_offset, 0), 0);
  v_meses  text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                           'septiembre','octubre','noviembre','diciembre'];
  v_nasi   bigint;
  v_nitems bigint;
  v_debe   numeric(14,2);
  v_haber  numeric(14,2);
  v_items  jsonb;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001',
      detail = json_build_object('campo', case when p_desde is null then 'desde' else 'hasta' end)::text;
  end if;
  if p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;
  if p_agrupar is null or p_agrupar not in ('dia', 'mes') then
    raise exception 'MODO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'modo', 'modo', p_agrupar)::text;
  end if;

  -- Totales: exactamente como cont_libro_diario.
  select count(*) into v_nasi
    from public.cont_asientos a
   where a.estado = 'confirmado' and a.fecha between p_desde and p_hasta;
  select coalesce(sum(l.debe), 0), coalesce(sum(l.haber), 0) into v_debe, v_haber
    from public.cont_asiento_lineas l join public.cont_asientos a on a.id = l.asiento_id
   where a.estado = 'confirmado' and a.fecha between p_desde and p_hasta;

  with a as materialized (
    select x.id, x.fecha, x.numero, x.origen_tabla, x.origen_id, x.revierte_id,
           case when x.tipo = 'automatico' then public._cont_circuito(x.origen_tabla) end as circ,
           case when p_agrupar = 'dia' then x.fecha else date_trunc('month', x.fecha::timestamp)::date end as per
      from public.cont_asientos x
     where x.estado = 'confirmado' and x.fecha between p_desde and p_hasta
  ),
  u as (
    select 'asiento'::text as clase, 'A' || a.id as clave, a.fecha, a.numero as num_min, a.id as id_min,
           null::text as circ, null::date as per
      from a where a.circ is null
    union all
    select 'resumen', a.circ || ':' || a.per,
           case when p_agrupar = 'dia' then a.per
                else least((a.per + interval '1 month' - interval '1 day')::date, p_hasta) end,
           min(a.numero), min(a.id), a.circ, a.per
      from a where a.circ is not null
     group by a.circ, a.per
  ),
  ord as (
    select u.*, row_number() over (order by u.fecha, u.num_min nulls last, u.clase, u.id_min) as rn,
           count(*) over () as n_items
      from u
  ),
  pag as (
    select * from ord order by rn limit v_lim offset v_off
  ),
  res as (
    select p.rn, p.clase, p.id_min, p.n_items,
           case when p.clase = 'asiento' then
             jsonb_build_object('clase', 'asiento', 'orden', p.rn) || public._cont_asiento_json(p.id_min)
           else (
             select jsonb_build_object(
                      'clase', 'resumen', 'orden', p.rn, 'clave', p.clave, 'circuito', p.circ,
                      'periodo_desde', g.pdesde, 'periodo_hasta', g.phasta, 'fecha', p.fecha,
                      'glosa', g.etiqueta
                               || case when p_agrupar = 'dia' then ' del ' || to_char(g.pdesde, 'DD/MM/YYYY')
                                       when g.pdesde = p.per and g.phasta = g.fin_mes
                                         then ' de ' || v_meses[extract(month from p.per)::int] || ' ' || extract(year from p.per)::int
                                       else ' del ' || to_char(g.pdesde, 'DD/MM/YYYY') || ' al ' || to_char(g.phasta, 'DD/MM/YYYY') end
                               || ' (' || g.ncomp || case when g.ncomp = 1 then ' comprobante' else ' comprobantes' end
                               || case when g.nrev = 1 then ', 1 reversión'
                                       when g.nrev > 1 then ', ' || g.nrev || ' reversiones' else '' end || ')',
                      'cantidad_comprobantes', g.ncomp, 'cantidad_asientos', g.nasi, 'cantidad_reversiones', g.nrev,
                      'numero_desde', g.nmin, 'numero_hasta', g.nmax, 'sin_numero', g.nsin,
                      'total', coalesce(t.debe, 0), 'cuadra', coalesce(t.debe, 0) = coalesce(t.haber, 0),
                      'lineas', coalesce(ln.lineas, '[]'::jsonb))
               from (select count(distinct (a2.origen_tabla, a2.origen_id)) as ncomp, count(*) as nasi,
                            count(*) filter (where a2.revierte_id is not null) as nrev,
                            min(a2.numero) as nmin, max(a2.numero) as nmax,
                            count(*) filter (where a2.numero is null) as nsin,
                            greatest(p.per, p_desde) as pdesde,
                            case when p_agrupar = 'dia' then p.per
                                 else least((p.per + interval '1 month' - interval '1 day')::date, p_hasta) end as phasta,
                            (p.per + interval '1 month' - interval '1 day')::date as fin_mes,
                            case p.circ when 'ventas' then 'Ventas' when 'cobros' then 'Cobros'
                                        when 'compras' then 'Compras' when 'pagos' then 'Pagos'
                                        else 'Otros automáticos' end as etiqueta
                       from a a2 where a2.circ = p.circ and a2.per = p.per) g
               cross join lateral (
                 select sum(l.debe)::numeric(14,2) as debe, sum(l.haber)::numeric(14,2) as haber
                   from a a3 join public.cont_asiento_lineas l on l.asiento_id = a3.id
                  where a3.circ = p.circ and a3.per = p.per) t
               cross join lateral (
                 select jsonb_agg(jsonb_build_object('cuenta_id', s.cuenta_id, 'cuenta_codigo', s.codigo,
                                                     'cuenta_nombre', s.nombre, 'debe', s.debe, 'haber', s.haber)
                                  order by s.lado, s.codigo_orden) as lineas
                   from (select 1 as lado, c.id as cuenta_id, c.codigo, c.nombre, c.codigo_orden,
                                sum(l.debe)::numeric(14,2) as debe, 0::numeric(14,2) as haber
                           from a a4 join public.cont_asiento_lineas l on l.asiento_id = a4.id
                           join public.cont_cuentas c on c.id = l.cuenta_id
                          where a4.circ = p.circ and a4.per = p.per and l.debe > 0
                          group by c.id, c.codigo, c.nombre, c.codigo_orden
                         union all
                         select 2, c.id, c.codigo, c.nombre, c.codigo_orden,
                                0::numeric(14,2), sum(l.haber)::numeric(14,2)
                           from a a4 join public.cont_asiento_lineas l on l.asiento_id = a4.id
                           join public.cont_cuentas c on c.id = l.cuenta_id
                          where a4.circ = p.circ and a4.per = p.per and l.haber > 0
                          group by c.id, c.codigo, c.nombre, c.codigo_orden) s) ln
           ) end as item
      from pag p
  )
  select coalesce(jsonb_agg(r.item order by r.rn), '[]'::jsonb),
         coalesce((select max(n_items) from ord), 0)
    into v_items, v_nitems
    from res r;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'modo', p_agrupar,
                            'total_items', v_nitems, 'total_asientos', v_nasi,
                            'total_debe', v_debe, 'total_haber', v_haber,
                            'cuadra', abs(v_debe - v_haber) < 0.005,
                            'items', v_items);
end $function$;

comment on function public.cont_libro_diario_resumido(date, date, text, integer, integer) is
  'Libro Diario resumido (20260928i): automáticos agrupados por circuito y día|mes con líneas por cuenta y lado; manuales uno por uno. Solo presentación.';

revoke all on function public._cont_circuito(text) from public, anon, authenticated;
grant execute on function public._cont_circuito(text) to service_role;
revoke all on function public.cont_libro_diario_resumido(date, date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.cont_libro_diario_resumido(date, date, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
