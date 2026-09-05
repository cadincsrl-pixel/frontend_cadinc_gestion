-- 20260905a — Vista de tipos de herramienta para la pestaña "Catálogo" de Herramientas
--
-- Un tipo = fila de `stock_materiales` con clase 'herramienta'. La vista suma
-- lo que dice el ledger del pañol por tipo: en obra (salidas confirmadas con
-- algo sin devolver), en cuántas obras, sin revisar, salidas y devoluciones
-- vivas, última fecha, y cuántos renglones de pedido lo usaron. security_invoker
-- como las demás vistas del módulo; el backend la lee con el cliente admin.

create or replace view public.v_herr_tipos with (security_invoker = true) as
select m.id, m.nombre, m.alias, m.obs, m.activo, m.rubro_id, m.created_at, m.updated_at,
       coalesce(e.en_obra, 0)      as en_obra,
       coalesce(e.n_obras, 0)      as n_obras,
       coalesce(e.sin_revisar, 0)  as sin_revisar,
       coalesce(e.salidas, 0)      as salidas,
       coalesce(e.devoluciones, 0) as devoluciones,
       e.ultima,
       (select count(*) from public.solicitud_compra_item i where i.material_id = m.id) as renglones
from public.stock_materiales m
left join (
  select material_id,
         coalesce(sum(en_obra) filter (where sentido = 'salida' and estado = 'confirmada'), 0)                as en_obra,
         count(distinct obra_cod) filter (where sentido = 'salida' and estado = 'confirmada' and en_obra > 0) as n_obras,
         count(*) filter (where sentido = 'salida' and estado = 'pendiente')                                   as sin_revisar,
         count(*) filter (where sentido = 'salida')                                                            as salidas,
         count(*) filter (where sentido = 'devolucion')                                                        as devoluciones,
         max(fecha)                                                                                            as ultima
    from public.herr_entregas
   where material_id is not null and estado <> 'anulada'
   group by material_id
) e on e.material_id = m.id
where m.clase = 'herramienta';

grant select on public.v_herr_tipos to authenticated, service_role;
