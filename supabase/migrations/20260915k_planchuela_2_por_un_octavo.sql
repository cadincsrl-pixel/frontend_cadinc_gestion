-- Falta la planchuela 2" x 1/8" y el renglón del techo quedó sin ficha
--
-- El renglón 3947 del pedido 807 (TECHO SAN MARTIN 1050) pedía "Planchuela 2"
-- x 1/8" y quedó en texto libre porque esa medida no estaba en el catálogo.
-- Están la de 1", 1-1/4", 1-1/2", la 2" x 3/16", la 3" x 1/4" y la galvanizada
-- 2" x 3/16", pero no la 2" x 1/8". El user confirmó que existe y pasó la
-- publicación de Gerdau.
--
-- FORMATO: la familia entera es rubro 7 (Herrería), unidad 'unid' y BARRA DE 6
-- METROS ("Planchuela N" x N" x 6m", seis fichas, sin excepción). La ficha
-- nueva sigue esa convención aunque la publicación venda por metro.
--
-- ⚠ EL PRECIO ES DERIVADO, NO UNA COMPRA. La publicación (Gerdau, 50,8x3,2mm)
-- dice $7.100 POR METRO, precio final con impuestos — que es la convención de
-- §5.14, donde todo precio del catálogo es final con IVA. Como la ficha es la
-- barra de 6m, el precio de referencia es 6 × 7.100 = $42.600, y entra por
-- `fijar_precio_ref` con fuente 'manual', que es la única puerta al catálogo.
--
-- Dos motivos para desconfiar de ese número y reemplazarlo con la factura real
-- en cuanto haya una:
--   1. Es precio de publicación minorista, no lo que le cobra el proveedor.
--   2. No cierra del todo con la familia: la de 1" x 1/8" x 6m está en
--      $14.318,67, o sea $2.386 el metro. La de 2" x 1/8" tiene el doble de
--      sección, así que por esa cuenta debería rondar los $4.772 el metro
--      ($28.600 la barra) y no $7.100. La diferencia es ~49%.
--      (Ojo que los precios de esta familia ya vienen sospechados: la de
--      1-1/4" tiene $7.227,12, que el diario del 14/09 anotó como el precio de
--      la de 3/4" cargado por error.)
--
-- ALIAS: NO se agrega "planchuela 2" a secas. Chocaría con la 2" x 3/16" (427)
-- y con la galvanizada 2" x 3/16" (2712), que es exactamente el alias corto
-- sobre fichas hermanas de distinta especificación que advierte §5.15. Todos
-- los alias llevan el espesor o la medida en milímetros.

do $mig$
declare v_id integer;
begin
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Planchuela 2" x 1/8" x 6m');

  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Planchuela 2" x 1/8" x 6m', 'unid', 7, 'material', true, 0,
            array['planchuela 2 x 1/8','planchuela 2x1/8','planchuela de 2 x 1/8',
                  'planchuela 2 1/8','planchuela hierro 2 x 1/8',
                  'planchuela de hierro 2 x 1/8','planchuela 2 pulgadas 1/8',
                  'planchuela 50x3.2','planchuela 50,8x3,2','planchuela 508x32']::text[])
    returning id into v_id;

    perform public.fijar_precio_ref(v_id, 42600, 'manual', null, null);
  end if;

  -- El renglón del pedido queda vinculado: así el pañol y la cuenta lo cuentan
  -- por ficha y no por texto. Sigue en 'pendiente', no toca nada congelado.
  update public.solicitud_compra_item
     set material_id = v_id,
         descripcion = 'Planchuela 2" x 1/8" x 6m'
   where id = 3947
     and estado = 'pendiente'
     and material_id is null;
end $mig$;
