-- =====================================================================
-- 20260928j — Contabilidad: Estado de situación patrimonial y Estado de
-- resultados (2026-09-24)
--
-- cont_balance(fecha): saldos desde el inicio del ejercicio hasta la fecha
-- (todas las líneas confirmadas, incluido el tipo `cierre`). Activo +s,
-- pasivo y PN −s (s = debe − haber). El resultado del ejercicio no cerrado
-- (−Σs de ingresos y egresos) va en el PN como fila virtual, así
-- Activo = Pasivo + PN. Grupos = hijas de nivel 2 de cada raíz (1.1/1.2,
-- 2.1/2.2, …) sacadas del plan, sin códigos fijos. Los totales salen de
-- las imputables, nunca de las filas filtradas por nivel.
--
-- cont_estado_resultados(desde, hasta): ingresos (haber − debe) y gastos
-- (debe − haber) del rango, SIN el tipo `cierre`; opcional comparativo por
-- mes (columnas del rango, máximo 12 porque el rango está en un ejercicio).
-- El título 4 (`resultado`) no es fila: su neto es `resultado`.
-- =====================================================================

create or replace function public.cont_balance(
  p_fecha date, p_nivel smallint default 3, p_incluir_cero boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_eje   public.cont_ejercicios%rowtype;
  v_out   jsonb;
begin
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end if;
  if p_nivel is null or p_nivel < 1 or p_nivel > 6 then
    raise exception 'NIVEL_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nivel', 'nivel', p_nivel)::text;
  end if;
  v_eje := public._cont_rango_ejercicio(p_fecha, p_fecha);

  with hoja as materialized (
    select c.codigo, c.rubro, sum(l.debe - l.haber) as s
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
      join public.cont_cuentas c on c.id = l.cuenta_id
     where a.estado = 'confirmado' and a.fecha between v_eje.desde and p_fecha
     group by c.codigo, c.rubro
  ),
  tot as (
    select coalesce(-sum(s) filter (where rubro in ('ingreso', 'egreso')), 0)::numeric(14,2) as res,
           coalesce( sum(s) filter (where rubro = 'activo'), 0)::numeric(14,2) as act,
           coalesce(-sum(s) filter (where rubro = 'pasivo'), 0)::numeric(14,2) as pas,
           coalesce(-sum(s) filter (where rubro = 'pn'), 0)::numeric(14,2) as pn
      from hoja
  ),
  arbol as materialized (
    select c.id, c.codigo, c.codigo_orden, c.nombre, c.nivel, c.rubro, c.imputable, c.padre_id, c.activo,
           coalesce(x.s, 0) as s, coalesce(x.n, 0) as n
      from public.cont_cuentas c
      left join lateral (
        select sum(h.s) as s, count(*) as n from hoja h
         where h.codigo = c.codigo or h.codigo like c.codigo || '.%') x on true
     where c.rubro in ('activo', 'pasivo', 'pn')
  ),
  filas as (
    select t.*, (case when t.rubro = 'activo' then t.s else -t.s end)::numeric(14,2) as saldo
      from arbol t
     where t.nivel <= p_nivel
       and (t.n > 0 or (coalesce(p_incluir_cero, false) and t.activo))
  ),
  grupos as (
    select g.rubro, g.id, g.codigo, g.codigo_orden, g.nombre,
           (case when g.rubro = 'activo' then g.s else -g.s end)::numeric(14,2) as total
      from arbol g
      join public.cont_cuentas r on r.id = g.padre_id and r.nivel = 1
     where g.nivel = 2
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'ejercicio', jsonb_build_object('id', v_eje.id, 'nombre', v_eje.nombre, 'desde', v_eje.desde, 'hasta', v_eje.hasta),
    'nivel', p_nivel,
    'sin_apertura', not exists (select 1 from public.cont_asientos a
                                 where a.ejercicio_id = v_eje.id and a.tipo = 'apertura' and a.estado = 'confirmado'),
    'activo', jsonb_build_object(
      'total', t.act,
      'grupos', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', g.id, 'codigo', g.codigo, 'nombre', g.nombre, 'total', g.total)
                                           order by g.codigo_orden) from grupos g where g.rubro = 'activo'), '[]'::jsonb),
      'filas', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'nivel', f.nivel,
                                           'rubro', f.rubro, 'imputable', f.imputable, 'padre_id', f.padre_id, 'virtual', false, 'saldo', f.saldo)
                                           order by f.codigo_orden) from filas f where f.rubro = 'activo'), '[]'::jsonb)),
    'pasivo', jsonb_build_object(
      'total', t.pas,
      'grupos', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', g.id, 'codigo', g.codigo, 'nombre', g.nombre, 'total', g.total)
                                           order by g.codigo_orden) from grupos g where g.rubro = 'pasivo'), '[]'::jsonb),
      'filas', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'nivel', f.nivel,
                                           'rubro', f.rubro, 'imputable', f.imputable, 'padre_id', f.padre_id, 'virtual', false, 'saldo', f.saldo)
                                           order by f.codigo_orden) from filas f where f.rubro = 'pasivo'), '[]'::jsonb)),
    'pn', jsonb_build_object(
      'total', t.pn + t.res,
      'resultado_ejercicio', t.res,
      'filas', coalesce((select jsonb_agg(x.j order by x.o1, x.o2)
                           from (select 0 as o1, f.codigo_orden as o2,
                                        jsonb_build_object('cuenta_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'nivel', f.nivel,
                                          'rubro', f.rubro, 'imputable', f.imputable, 'padre_id', f.padre_id, 'virtual', false, 'saldo', f.saldo) as j
                                   from filas f where f.rubro = 'pn'
                                 union all
                                 select 1, null::int[],
                                        jsonb_build_object('cuenta_id', null, 'codigo', null, 'nombre', 'Resultado del ejercicio (no cerrado)',
                                          'nivel', 2, 'rubro', 'pn', 'imputable', false, 'padre_id', null, 'virtual', true, 'saldo', t.res)
                                  where t.res <> 0 or coalesce(p_incluir_cero, false)) x), '[]'::jsonb)),
    'pasivo_mas_pn', t.pas + t.pn + t.res,
    'diferencia', t.act - (t.pas + t.pn + t.res),
    'cuadra', abs(t.act - (t.pas + t.pn + t.res)) < 0.005)
    into v_out
    from tot t;
  return v_out;
end $function$;

comment on function public.cont_balance(date, smallint, boolean) is
  'Estado de situación patrimonial a una fecha (20260928j). Resultado del ejercicio no cerrado como fila virtual del PN.';

create or replace function public.cont_estado_resultados(
  p_desde date, p_hasta date, p_nivel smallint default 4,
  p_comparativo boolean default false, p_incluir_cero boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_eje   public.cont_ejercicios%rowtype;
  v_abr   text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  v_out   jsonb;
begin
  v_eje := public._cont_rango_ejercicio(p_desde, p_hasta);
  if p_nivel is null or p_nivel < 1 or p_nivel > 6 then
    raise exception 'NIVEL_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nivel', 'nivel', p_nivel)::text;
  end if;

  with cols as materialized (
    select row_number() over (order by m)::int as idx, m::date as mes,
           greatest(m::date, p_desde) as desde, least((m + interval '1 month' - interval '1 day')::date, p_hasta) as hasta
      from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') m
     where coalesce(p_comparativo, false)
  ),
  -- Hojas: importe con el signo de la sección (ingreso: haber − debe; egreso: debe − haber), por columna (0 = sin comparativo).
  hoja as materialized (
    select c.codigo, c.rubro, coalesce(cc.idx, 0) as idx,
           sum(case when c.rubro = 'ingreso' then l.haber - l.debe else l.debe - l.haber end) as v
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
      join public.cont_cuentas c on c.id = l.cuenta_id
      left join cols cc on a.fecha between cc.desde and cc.hasta
     where a.estado = 'confirmado' and a.tipo <> 'cierre'
       and a.fecha between p_desde and p_hasta
       and c.rubro in ('ingreso', 'egreso')
     group by c.codigo, c.rubro, coalesce(cc.idx, 0)
  ),
  arbol as (
    select c.id, c.codigo, c.codigo_orden, c.nombre, c.nivel, c.rubro, c.imputable, c.padre_id, c.activo,
           coalesce(x.v, 0)::numeric(14,2) as saldo, coalesce(x.n, 0) as n,
           (select coalesce(jsonb_agg(coalesce(y.v, 0)::numeric(14,2) order by k.idx), '[]'::jsonb)
              from cols k
              left join lateral (select sum(h.v) as v from hoja h
                                  where h.idx = k.idx and (h.codigo = c.codigo or h.codigo like c.codigo || '.%')) y on true) as importes
      from public.cont_cuentas c
      left join lateral (
        select sum(h.v) as v, count(*) as n from hoja h
         where h.codigo = c.codigo or h.codigo like c.codigo || '.%') x on true
     where c.rubro in ('ingreso', 'egreso')
  ),
  filas as (
    select * from arbol t
     where t.nivel <= p_nivel and (t.n > 0 or (coalesce(p_incluir_cero, false) and t.activo))
  ),
  tot as (
    select coalesce(sum(v) filter (where rubro = 'ingreso'), 0)::numeric(14,2) as ing,
           coalesce(sum(v) filter (where rubro = 'egreso'), 0)::numeric(14,2) as gas
      from hoja
  ),
  totcol as (
    select k.idx,
           coalesce(sum(h.v) filter (where h.rubro = 'ingreso'), 0)::numeric(14,2) as ing,
           coalesce(sum(h.v) filter (where h.rubro = 'egreso'), 0)::numeric(14,2) as gas
      from cols k left join hoja h on h.idx = k.idx
     group by k.idx
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'ejercicio', jsonb_build_object('id', v_eje.id, 'nombre', v_eje.nombre, 'desde', v_eje.desde, 'hasta', v_eje.hasta),
    'nivel', p_nivel, 'comparativo', coalesce(p_comparativo, false),
    'columnas', coalesce((select jsonb_agg(jsonb_build_object('clave', to_char(c.mes, 'YYYY-MM'), 'desde', c.desde, 'hasta', c.hasta,
                                               'etiqueta', v_abr[extract(month from c.mes)::int] || ' ' || extract(year from c.mes)::int)
                                           order by c.idx) from cols c), '[]'::jsonb),
    'ingresos', jsonb_build_object(
      'total', t.ing,
      'totales_col', coalesce((select jsonb_agg(tc.ing order by tc.idx) from totcol tc), '[]'::jsonb),
      'filas', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'nivel', f.nivel,
                                           'rubro', f.rubro, 'imputable', f.imputable, 'padre_id', f.padre_id, 'virtual', false,
                                           'saldo', f.saldo, 'importes', f.importes)
                                           order by f.codigo_orden) from filas f where f.rubro = 'ingreso'), '[]'::jsonb)),
    'gastos', jsonb_build_object(
      'total', t.gas,
      'totales_col', coalesce((select jsonb_agg(tc.gas order by tc.idx) from totcol tc), '[]'::jsonb),
      'filas', coalesce((select jsonb_agg(jsonb_build_object('cuenta_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'nivel', f.nivel,
                                           'rubro', f.rubro, 'imputable', f.imputable, 'padre_id', f.padre_id, 'virtual', false,
                                           'saldo', f.saldo, 'importes', f.importes)
                                           order by f.codigo_orden) from filas f where f.rubro = 'egreso'), '[]'::jsonb)),
    'resultado', jsonb_build_object(
      'total', t.ing - t.gas,
      'totales_col', coalesce((select jsonb_agg(tc.ing - tc.gas order by tc.idx) from totcol tc), '[]'::jsonb)))
    into v_out
    from tot t;
  return v_out;
end $function$;

comment on function public.cont_estado_resultados(date, date, smallint, boolean, boolean) is
  'Estado de resultados de un rango dentro de un ejercicio (20260928j), sin asientos de cierre; comparativo opcional por mes.';

revoke all on function public.cont_balance(date, smallint, boolean) from public, anon, authenticated;
grant execute on function public.cont_balance(date, smallint, boolean) to service_role;
revoke all on function public.cont_estado_resultados(date, date, smallint, boolean, boolean) from public, anon, authenticated;
grant execute on function public.cont_estado_resultados(date, date, smallint, boolean, boolean) to service_role;

notify pgrst, 'reload schema';
