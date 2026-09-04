-- Alta: limpiavidrios liquido.
--
-- Sale de ordenar el "por recibir en deposito": el renglon "limpia vidrio" del
-- pedido #436 (30 unidades compradas a $17.000) viajaba como texto libre, y un
-- renglon sin material del catalogo NO suma stock al recibirse en el deposito.
-- El user confirmo que es el liquido, no el secador de goma.
--
-- Rubro 6 (Ferreteria general), al lado del Limpiador cremoso (Cif). Unidad
-- `unid`: se compra por envase, no por litro — la leccion de la lana de vidrio
-- es que la unidad tiene que ser la que factura el proveedor, no la que le
-- viene bien a quien lo pide.

insert into public.stock_materiales
  (nombre, unidad, rubro_id, clase, activo, stock_actual, stock_minimo, precio_ref, alias)
values (
  'Limpiavidrios',
  'unid', 6, 'material', true, 0, 0, 17000,
  array['limpia vidrio','limpia vidrios','limpiavidrio','limpiavidrios',
        'liquido limpia vidrio','limpiador de vidrios']
)
on conflict do nothing;
