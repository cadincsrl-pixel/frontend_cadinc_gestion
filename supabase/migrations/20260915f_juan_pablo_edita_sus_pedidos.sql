-- Juan Pablo puede editar sus propios pedidos — flag `editar_pedidos`
--
-- Pedido del user el 15/09, con la regla dicha por él: "si hace un pedido él
-- para una obra de él y pone en cantidad 10 pueda editar siempre y cuando no
-- esté comprado ni enviado y poner 20".
--
-- POR QUÉ UN FLAG NUEVO Y NO `actualizacion`. El permiso de actualización es de
-- TODO el módulo certificaciones, no de los pedidos. Con él, Juan Pablo también
-- podría marcar renglones como consumible propio (que mueve plata de la cuenta
-- del cliente al gasto de CADINC), editar cobros, proveedores, facturas de
-- compra, certificaciones y fichas de stock. Acotarle las pestañas tapa las dos
-- primeras, porque la cuenta corriente sí mira la pestaña, pero proveedores,
-- facturas, certificaciones y el PATCH general de stock no la miran: por API le
-- quedarían abiertas igual.
--
-- El flag `editar_pedidos` (default false) habilita SOLO
-- PATCH /api/solicitudes/:id, y únicamente sobre pedidos propios. Sigue el
-- mismo molde que `resolver_items`. Backend: requireEditarOFlag +
-- requireDuenoDelPedido en solicitudes.routes.ts. Frontend: usePermisos
-- expone `editarPedidos` y el botón Editar se habilita con
-- `puedeEditar || (editarPedidos && s.created_by === miId)`.
--
-- LO QUE NO ALCANZA, y es la otra mitad de lo que pidió el user: un renglón ya
-- comprado o enviado. Eso no depende del flag — el service filtra por
-- estado='pendiente' tanto al actualizar como al borrar renglones, así que la
-- corrección sólo toca lo que todavía no se resolvió. Ya era así.
--
-- TRAZA: desde 20260915d/e, cualquier edición de pedido deja en audit_log el
-- antes y el después campo por campo, y un renglón borrado deja volcada la fila
-- entera. Se ve en Admin › Movimientos / Auditoría.
--
-- QUEDA IGUAL, a propósito: su `obras_scope` sigue en 'todas'. El flag lo limita
-- por AUTOR, no por obra, así que puede corregir los pedidos que cargó él y
-- ninguno más. Si además hay que acotarle las obras, es otra decisión.

update profiles
   set permisos = jsonb_set(
         coalesce(permisos, '{}'::jsonb),
         '{certificaciones,editar_pedidos}',
         'true'::jsonb,
         true
       ),
       personalizado = true
 where id = 'a262c99a-e4ea-416f-9601-e6dfd766dc28'
   and coalesce((permisos->'certificaciones'->>'editar_pedidos')::boolean, false) = false;
