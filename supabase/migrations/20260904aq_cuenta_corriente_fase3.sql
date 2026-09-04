-- 20260904aq — Cuenta corriente, fase 3: se van las pestañas viejas
--
-- Probada en prod la pestaña "Cuenta corriente" (20260904ap), el user dio el
-- OK para cerrar: las pestañas "Cuenta del cliente", "Gastos de CADINC" y
-- "Materiales" (cert_materiales, 0 filas) desaparecen del frontend.
-- 1) profiles.permisos.certificaciones.tabs: cuenta-cliente, gastos-cadinc y
--    materiales pasan a cuenta-corriente (sin duplicar, manteniendo el orden).
--    Hoy es un solo perfil; los admin no usan la lista.
-- 2) v_gastos_cadinc_obra ya no tiene consumidor (el resumen sale de
--    cuenta_corriente_resumen).

with viejos as (
  select id, permisos->'certificaciones'->'tabs' as tabs
  from public.profiles
  where permisos->'certificaciones'->'tabs' ?| array['cuenta-cliente', 'gastos-cadinc', 'materiales']
), nuevos as (
  select v.id,
         (select coalesce(jsonb_agg(d.t order by d.ord), '[]'::jsonb)
            from (
              select distinct on (m.t) m.t, m.ord
              from (
                select case when x.t in ('cuenta-cliente', 'gastos-cadinc', 'materiales') then 'cuenta-corriente' else x.t end as t,
                       x.ord
                from jsonb_array_elements_text(v.tabs) with ordinality as x(t, ord)
              ) m
              order by m.t, m.ord
            ) d) as tabs
  from viejos v
)
update public.profiles p
   set permisos = jsonb_set(p.permisos, '{certificaciones,tabs}', n.tabs)
  from nuevos n
 where p.id = n.id;

drop view if exists public.v_gastos_cadinc_obra;
