-- RPCs por obra para evitar el hard cap de PostgREST (1000 rows).
--
-- Contexto: el server PostgREST de Supabase impone un cap de 1000 rows
-- que el cliente NO puede bypassear (ni con .range(0, 99999) ni con header
-- Range custom — el server responde con content-range: 0-999/N igual).
-- Caso histórico: bug de Candela (2026-05-20) — 5 trabajadores invisibles
-- por cap en `filtrarLegsPermitidos`, resuelto con `legs_de_obras` RPC.
--
-- Esta migración crea RPCs equivalentes para los 7 endpoints que filtran
-- por `obra_cod IN allowed`. Hoy ninguna de esas tablas supera el cap,
-- pero el patrón quedó documentado y aplicado preventivamente.
--
-- Cada RPC retorna SETOF <tabla> manteniendo el shape del .select('*').

create or replace function asignaciones_de_obras(p_obras text[])
returns setof asignaciones
language sql stable security invoker as $$
  select * from asignaciones where obra_cod = any(p_obras)
$$;
grant execute on function asignaciones_de_obras(text[]) to authenticated;

create or replace function cierres_de_obras(p_obras text[])
returns setof cierres
language sql stable security invoker as $$
  select * from cierres where obra_cod = any(p_obras)
$$;
grant execute on function cierres_de_obras(text[]) to authenticated;

create or replace function hs_extras_de_obras(p_obras text[])
returns setof tarja_hs_extras
language sql stable security invoker as $$
  select * from tarja_hs_extras where obra_cod = any(p_obras) order by sem_key
$$;
grant execute on function hs_extras_de_obras(text[]) to authenticated;

create or replace function certificaciones_de_obras(p_obras text[])
returns setof certificaciones
language sql stable security invoker as $$
  select * from certificaciones where obra_cod = any(p_obras)
$$;
grant execute on function certificaciones_de_obras(text[]) to authenticated;

create or replace function tarifas_de_obras(p_obras text[])
returns setof tarifas
language sql stable security invoker as $$
  select * from tarifas where obra_cod = any(p_obras) order by desde
$$;
grant execute on function tarifas_de_obras(text[]) to authenticated;

create or replace function cat_obra_de_obras(p_obras text[])
returns setof cat_obra
language sql stable security invoker as $$
  select * from cat_obra where obra_cod = any(p_obras)
$$;
grant execute on function cat_obra_de_obras(text[]) to authenticated;

create or replace function rutas_de_canteras_depositos(
  p_canteras int[],
  p_depositos int[]
)
returns setof rutas
language sql stable security invoker as $$
  select * from rutas
  where cantera_id  = any(p_canteras)
    and deposito_id = any(p_depositos)
$$;
grant execute on function rutas_de_canteras_depositos(int[], int[]) to authenticated;
