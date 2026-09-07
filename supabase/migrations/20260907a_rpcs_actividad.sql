-- 20260907a — RPCs de actividad para Personal, Ropa y el resumen de obras.
--
-- Hasta hoy seis pantallas bajaban TODA la tabla `horas` (19k filas, en
-- páginas de 1000) solo para saber quién está activo, en qué obra estuvo cada
-- legajo por última vez o cuántas horas tiene cada obra esta semana. Estas
-- dos funciones devuelven eso agregado: ~110 filas por legajo y ~30 por obra.
-- Se llaman desde el backend con el cliente service_role (security invoker,
-- RLS permisiva); el backend aplica el alcance por obras (p_obras) y por
-- legajos antes/después.

-- Por legajo: última fecha con horas reales, obras de esa última semana
-- (viernes→jueves) y cantidad de filas de horas desde p_desde (el viernes de
-- corte de "activo": cualquier fila cuenta, también los placeholders en 0,
-- igual que hacía el frontend).
create or replace function public.personal_actividad(p_desde date, p_obras text[] default null)
returns table (leg text, ultima_fecha date, obras_ultima_semana text[], filas_desde integer)
language sql
stable
set search_path = public
as $$
  with h as (
    select leg, obra_cod, fecha, horas
    from public.horas
    where p_obras is null or obra_cod = any (p_obras)
  ),
  ult as (
    select leg,
           max(fecha) filter (where horas > 0)      as ultima_fecha,
           count(*)   filter (where fecha >= p_desde) as filas_desde
    from h
    group by leg
  ),
  sem as (
    -- viernes de la semana de la última fecha: dow domingo=0 … viernes=5
    select u.leg, u.ultima_fecha, u.filas_desde,
           (u.ultima_fecha - (((extract(dow from u.ultima_fecha)::int - 5) + 7) % 7)) as vie
    from ult u
  ),
  ob as (
    select s.leg, array_agg(distinct x.obra_cod) as obras
    from sem s
    join h x on x.leg = s.leg and x.horas > 0 and x.fecha between s.vie and s.vie + 6
    group by s.leg
  )
  select s.leg, s.ultima_fecha, ob.obras, s.filas_desde::int
  from sem s
  left join ob on ob.leg = s.leg;
$$;

-- Por obra: horas y trabajadores de la semana p_vie (viernes→jueves), totales
-- históricos, última fecha con horas reales y quién hizo la última carga.
create or replace function public.obras_actividad(p_vie date, p_obras text[] default null)
returns table (
  obra_cod text,
  hs_semana numeric,
  trabajadores_semana integer,
  hs_total numeric,
  trabajadores_total integer,
  ultima_actividad date,
  ultima_carga_por uuid
)
language sql
stable
set search_path = public
as $$
  with h as (
    select obra_cod, leg, fecha, horas, updated_at, updated_by
    from public.horas
    where p_obras is null or obra_cod = any (p_obras)
  ),
  sem as (
    select obra_cod, sum(horas) as hs_semana, count(distinct leg) as trabajadores_semana
    from h
    where fecha between p_vie and p_vie + 6
    group by obra_cod
  ),
  tot as (
    select obra_cod,
           sum(horas)                              as hs_total,
           count(distinct leg)                     as trabajadores_total,
           max(fecha) filter (where horas > 0)     as ultima_actividad
    from h
    group by obra_cod
  ),
  carga as (
    select distinct on (obra_cod) obra_cod, updated_by
    from h
    where horas > 0
    order by obra_cod, updated_at desc nulls last
  )
  select t.obra_cod,
         coalesce(s.hs_semana, 0),
         coalesce(s.trabajadores_semana, 0)::int,
         t.hs_total,
         t.trabajadores_total::int,
         t.ultima_actividad,
         c.updated_by
  from tot t
  left join sem s using (obra_cod)
  left join carga c using (obra_cod);
$$;

revoke all on function public.personal_actividad(date, text[]) from public, anon, authenticated;
revoke all on function public.obras_actividad(date, text[])    from public, anon, authenticated;
grant execute on function public.personal_actividad(date, text[]) to service_role;
grant execute on function public.obras_actividad(date, text[])    to service_role;

comment on function public.personal_actividad(date, text[]) is 'Actividad por legajo para Personal/Ropa (GET /api/personal/actividad). Llamar con service_role; el backend aplica alcance.';
comment on function public.obras_actividad(date, text[])    is 'Resumen por obra de una semana + históricos (GET /api/horas/resumen-obras). Llamar con service_role.';
