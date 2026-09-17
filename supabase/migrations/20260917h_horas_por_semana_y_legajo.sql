-- Horas agregadas por (obra, semana, legajo), para el resumen de todas las obras
--
-- El resumen de cuenta corriente de TODAS las obras (17/09) necesita el costo
-- de jornales de cada obra, calculado en el servidor con la fórmula canónica
-- (`calcularCostoObra`, cadincsrl/src/modules/horas/costo-obra.ts). Esa
-- fórmula sólo necesita las horas sumadas por (semana, legajo): el vh se
-- resuelve por legajo a la fecha de referencia de la semana, y el redondeo al
-- mil es por operario-semana. O sea que bajar las 21.000 filas crudas de
-- `horas` (22 páginas de PostgREST cada vez) era tirar 4 de cada 5 bytes.
--
-- Esta función devuelve lo que la fórmula consume: ~4.000 filas en vez de
-- 21.000. Sigue pudiendo pasar de 1.000, así que el backend la lee con
-- `todasLasFilas` (el tope de PostgREST aplica también a las RPC, §5.7).
--
-- `sem_key` = el VIERNES de la semana (§5.3): d - ((dow + 2) % 7). Es la
-- misma cuenta que `viernesISO` del backend y `getViernes` del front.
--
-- STABLE y sin SECURITY DEFINER: lee `horas` con los permisos del que llama,
-- y el que llama es el backend como service_role. A `anon` y `authenticated`
-- se les revoca a propósito: las horas son costo, no se leen desde el front.

create or replace function public.horas_semana_leg(p_obras text[] default null)
returns table(obra_cod text, sem_key date, leg text, horas numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select h.obra_cod,
         h.fecha - ((extract(dow from h.fecha)::int + 2) % 7) as sem_key,
         h.leg,
         sum(h.horas) as horas
    from public.horas h
   where h.horas > 0
     and (p_obras is null or h.obra_cod = any(p_obras))
   group by 1, 2, 3
   order by 1, 2, 3
$$;

revoke all on function public.horas_semana_leg(text[]) from public, anon, authenticated;
grant execute on function public.horas_semana_leg(text[]) to service_role;
