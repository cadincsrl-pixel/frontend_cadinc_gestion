-- =====================================================================
-- 20261005e — Alertas del pañol: herramientas afuera hace mucho
-- (2026-09-26, revisión del circuito Pedidos y Stock, hallazgo C9/C4)
--
-- Una fila por obra con herramientas que siguen «en obra» desde hace más de
-- 60 días, o con CUALQUIER herramienta afuera si la obra ya está archivada.
-- La lee la campana (GET /api/herramientas/entregas/alertas). Al 26/09:
-- 12 obras con 145 unidades de más de 60 días y 2 archivadas con 3.
-- Vista (no RPC) porque es chica: una fila por obra; security_invoker como
-- el resto de las vistas del pañol.
-- =====================================================================

create or replace view public.v_herr_alertas_en_obra
with (security_invoker = true) as
select e.obra_cod,
       coalesce(o.nom, e.obra_cod)                    as obra_nom,
       coalesce(o.archivada, false)                   as archivada,
       sum(e.cantidad - e.devuelto)                   as unidades,
       count(*)                                       as salidas,
       min(e.fecha)                                   as desde
  from public.herr_entregas e
  left join public.obras o on o.cod = e.obra_cod
 where e.sentido = 'salida'
   and e.estado = 'confirmada'
   and e.cantidad - e.devuelto > 0
   and (e.fecha < current_date - 60 or coalesce(o.archivada, false))
 group by e.obra_cod, o.nom, o.archivada;

comment on view public.v_herr_alertas_en_obra is
  'Obras con herramientas en obra hace más de 60 días (o archivadas con algo afuera). Campana del pañol. 20261005e.';

-- Como v_herr_entregas_obras: la lee solo el backend (service_role).
revoke select on public.v_herr_alertas_en_obra from anon, authenticated;
grant select on public.v_herr_alertas_en_obra to service_role;
