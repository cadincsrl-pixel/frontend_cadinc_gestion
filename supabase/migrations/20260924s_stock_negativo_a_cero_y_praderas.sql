-- =====================================================================
-- Stock negativo a cero, y dos renglones de Praderas a la cuenta (2026-09-24)
--
-- Tanda 3 de la revisión de Pedidos y Stock (A6 y B3). Decisiones del dueño
-- del 24/09:
--
-- 1. «Poné todo el stock negativo en cero». Un ajuste de inventario por cada
--    ficha con stock_actual < 0, por la cantidad que falta para llegar a 0,
--    igual que los ajustes del recuento (tipo 'ajuste', motivo
--    'ajuste_inventario'). No es un recuento: es aceptar que lo que salió ya
--    no está. Si el próximo recuento encuentra algo, se ajusta desde ahí.
--    El motivo de fondo (bultos contra fracciones, alias cortos, despachos
--    sin ficha) está en CLAUDE.md §5.15 y en la revisión del 23/09.
--
-- 2. Praderas, dos renglones de abril enviados que nunca entraron a la
--    cuenta (nacieron antes del circuito de la cuenta del cliente): los pagó
--    CADINC y se cobran.
--      item 32  acelerante de fraguado  (Pollano, $10.000)  → origen proveedor
--      item 33  cemento Portland x25    (depósito, $0)      → origen depósito,
--               al precio de catálogo ($7.146)
-- =====================================================================

do $$
declare
  v_n int;
begin
  -- 1. Stock negativo → 0.
  insert into stock_movimientos (material_id, tipo, cantidad, motivo, obs, fecha, estado)
  select id, 'ajuste', -stock_actual, 'ajuste_inventario',
         'Stock negativo llevado a cero por decisión del dueño (revisión 23/09): el sistema decía '
           || trim(to_char(stock_actual, 'FM999999990.####')) || ' ' || coalesce(unidad, ''),
         current_date, 'aprobado'
    from stock_materiales where stock_actual < 0;
  get diagnostics v_n = row_count;
  update stock_materiales set stock_actual = 0, updated_at = now() where stock_actual < 0;
  raise notice 'fichas llevadas a cero: %', v_n;

  -- 2. Praderas.
  perform 1 from materiales_a_cuenta_cliente where item_id in (32, 33);
  if found then raise exception 'Praderas: los items 32/33 ya tienen fila en la cuenta'; end if;

  update solicitud_compra_item set precio_unit = 7146 where id = 33 and coalesce(precio_unit, 0) = 0;

  insert into materiales_a_cuenta_cliente
    (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad, precio_unit, precio_total,
     origen, proveedor_id, factura_id, fecha_resolucion, pagado_por)
  select s.obra_cod, i.solicitud_id, i.id, i.descripcion, i.cantidad, i.unidad, i.precio_unit,
         round(i.cantidad * i.precio_unit, 2),
         case when i.id = 33 then 'deposito' else 'proveedor' end,
         i.proveedor_id, i.factura_id, i.fecha_resolucion, 'cadinc'
    from solicitud_compra_item i join solicitud_compra s on s.id = i.solicitud_id
   where i.id in (32, 33);
  get diagnostics v_n = row_count;
  if v_n <> 2 then raise exception 'Praderas: esperaba 2 filas, son %', v_n; end if;

  insert into solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', i.estado, i.estado, i.cantidad,
         'Entra a la cuenta del cliente: enviado en abril, nunca había entrado (revisión 23/09, decisión del dueño 24/09)',
         jsonb_build_object('migracion', '20260924s')
    from solicitud_compra_item i where i.id in (32, 33);
end $$;
