-- RPC: última entrega de ropa por (leg, categoría) para un set de legajos.
-- Motivo: la página de Ropa ordena/filtra por vencimiento sobre TODOS los
-- trabajadores activos. Traer ropa_entregas crudo con .in('leg', ...) desde el
-- cliente choca con el hard cap de 1000 rows de PostgREST cuando la tabla
-- crece (CLAUDE.md §5.7). Esta función agrega server-side: devuelve a lo sumo
-- una fila por par (leg, categoría), acotado por personal × categorías.
-- SECURITY INVOKER (default): corre como el caller autenticado con la RLS
-- permisiva existente — no aplica la revocación de 20260527 (solo secdef).

create or replace function public.ropa_ultimas_entregas(p_legs text[])
returns setof public.ropa_entregas
language sql
stable
as $$
  select distinct on (leg, categoria_id) *
  from public.ropa_entregas
  where leg = any(p_legs)
  order by leg, categoria_id, fecha_entrega desc, id desc
$$;

grant execute on function public.ropa_ultimas_entregas(text[]) to authenticated;
