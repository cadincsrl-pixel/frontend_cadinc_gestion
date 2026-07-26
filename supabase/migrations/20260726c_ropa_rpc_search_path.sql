-- Fija el search_path de ropa_ultimas_entregas (creada en 20260726_rpc_ropa_ultimas_entregas).
-- El advisor de Supabase la marcaba con "Function Search Path Mutable": sin un
-- search_path fijo, el nombre `ropa_entregas` se resuelve contra el search_path
-- del caller. Es SECURITY INVOKER, así que el riesgo era bajo, pero no hay razón
-- para dejarla así. Misma definición, sólo se agrega el SET.

create or replace function public.ropa_ultimas_entregas(p_legs text[])
returns setof public.ropa_entregas
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select distinct on (leg, categoria_id) *
  from public.ropa_entregas
  where leg = any(p_legs)
  order by leg, categoria_id, fecha_entrega desc, id desc
$$;

grant execute on function public.ropa_ultimas_entregas(text[]) to authenticated;
