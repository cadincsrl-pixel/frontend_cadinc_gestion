-- Conteo de materiales "sin precio" (a tasar) por obra, AGREGADO server-side.
-- Evita el cap de 1000 filas de PostgREST (CLAUDE.md §5.7): el endpoint de
-- pendientes traía una fila por material en $0 y contaba en JS, lo que
-- subcontaría si el backlog de "a tasar" superara 1000 ítems. La vista
-- devuelve una fila por obra (siempre << 1000).
-- security_invoker: respeta la RLS (permisiva) de la tabla base y evita el
-- warning del advisor por vistas security-definer.
create or replace view public.v_cuenta_cliente_pendientes
  with (security_invoker = true) as
select obra_cod, count(*)::int as sin_precio
from public.materiales_a_cuenta_cliente
where precio_unit = 0
group by obra_cod;

grant select on public.v_cuenta_cliente_pendientes to anon, authenticated, service_role;
