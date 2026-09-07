-- 20260907b — Trabajadores por obra sin contar placeholders; códigos de obra
-- más allá de CC-999.

-- 1) obras_actividad: "trabajadores" cuenta legajos con horas > 0. Los
--    placeholders en 0 que crea la copia de semana inflaban "Trab. esta
--    semana" (y el CSV) aunque nadie hubiera cargado nada.
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
    select obra_cod,
           sum(horas)                                       as hs_semana,
           count(distinct leg) filter (where horas > 0)     as trabajadores_semana
    from h
    where fecha between p_vie and p_vie + 6
    group by obra_cod
  ),
  tot as (
    select obra_cod,
           sum(horas)                                       as hs_total,
           count(distinct leg) filter (where horas > 0)     as trabajadores_total,
           max(fecha) filter (where horas > 0)              as ultima_actividad
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
         coalesce(t.trabajadores_total, 0)::int,
         t.ultima_actividad,
         c.updated_by
  from tot t
  left join sem s using (obra_cod)
  left join carga c using (obra_cod);
$$;

-- 2) LPAD(n, 3) truncaba desde la obra 1000 ("1000" → "000" → CC-000 repetido).
create or replace function public.siguiente_codigo_obra()
returns text
language sql
security definer
set search_path = public
as $$
  select 'CC-' || lpad(n::text, greatest(3, length(n::text)), '0')
  from nextval('obras_cod_seq') as n;
$$;

create or replace function public.proximo_codigo_obra_preview()
returns text
language sql
security definer
set search_path = public
as $$
  select 'CC-' || lpad(n::text, greatest(3, length(n::text)), '0')
  from (
    select case when is_called then last_value + 1 else last_value end as n
    from obras_cod_seq
  ) s;
$$;
