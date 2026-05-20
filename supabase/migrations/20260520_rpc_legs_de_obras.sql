-- RPC `legs_de_obras` — devuelve los legs únicos con horas o asignaciones
-- en cualquiera de las obras pasadas.
--
-- Contexto: el endpoint GET /api/personal (y `filtrarLegsPermitidos`)
-- necesitaba la unión de legs en `horas` + `asignaciones` para filtrar el
-- padrón a los trabajadores visibles para capataces / jefes de obra.
--
-- La query original
--   supabase.from('horas').select('leg').in('obra_cod', allowed)
-- caía en el hard cap de PostgREST (1000 filas) cuando una obra acumulaba
-- muchas semanas. El `.range(0, 99999)` del JS client NO supera el cap del
-- servidor (verificado: devuelve content-range 0-999/1705).
--
-- Esta RPC resuelve el cap haciendo DISTINCT en SQL: el resultado es
-- ~N legs únicos en vez de N filas de horas, lejos de cualquier límite.

create or replace function legs_de_obras(p_obras text[])
returns table (leg text)
language sql
stable
security invoker
as $$
  select distinct leg from horas where obra_cod = any(p_obras)
  union
  select distinct leg from asignaciones where obra_cod = any(p_obras)
$$;

-- Permitir que cualquier usuario autenticado la invoque (RLS sigue aplicando
-- a las tablas subyacentes, que ya son `using(true)` permisivas).
grant execute on function legs_de_obras(text[]) to authenticated;
