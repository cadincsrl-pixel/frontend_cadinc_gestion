-- Los triggers de auditoria sobre pedidos y renglones
--
-- Segunda mitad de 20260915b (ahi quedo la funcion audit_borrado). El detalle
-- de por que y como esta en el encabezado de esa migracion.
--
-- Probado con arnes de rollback antes de aplicar, los cuatro casos:
--   EDICION  -> "obs: null -> ajuste · cantidad: 10 -> 3"
--   CABECERA -> "obs: ... -> cambio · prioridad: normal -> urgente"
--   COMPRA   -> NO audita (la lista de columnas la deja pasar)
--   BORRADO  -> vuelca la fila entera: id, descripcion, cantidad, unidad,
--               estado, material_id, precio_unit, proveedor, pagado_por...

-- 2. La cabecera del pedido: sin lista de columnas, sólo se toca al editar.
drop trigger if exists trg_audit_cambios on public.solicitud_compra;
create trigger trg_audit_cambios
  after update on public.solicitud_compra
  for each row execute function audit_cambios('certificaciones', 'pedido', 'id');

drop trigger if exists trg_audit_borrado on public.solicitud_compra;
create trigger trg_audit_borrado
  after delete on public.solicitud_compra
  for each row execute function audit_borrado('certificaciones', 'pedido', 'id');

-- 3. El renglón: sólo las columnas que se editan, para no duplicar el flujo de
--    compra/despacho que ya está auditado dos veces.
drop trigger if exists trg_audit_cambios on public.solicitud_compra_item;
create trigger trg_audit_cambios
  after update of descripcion, cantidad, unidad, obs, color, clase, devuelve, material_id
  on public.solicitud_compra_item
  for each row execute function audit_cambios('certificaciones', 'renglón de pedido', 'id');

drop trigger if exists trg_audit_borrado on public.solicitud_compra_item;
create trigger trg_audit_borrado
  after delete on public.solicitud_compra_item
  for each row execute function audit_borrado('certificaciones', 'renglón de pedido', 'id');
