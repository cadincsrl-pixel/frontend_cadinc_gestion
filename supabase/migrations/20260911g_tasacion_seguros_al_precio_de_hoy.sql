-- 20260911g — Los 16 renglones en $0 que se pueden tasar sin adivinar.
--
-- De los 449 renglones de la cuenta del cliente en $0 (08/09/2026):
--   191 no tienen ficha (texto libre)         -> no se puede
--   207 tienen ficha pero la ficha esta en 0  -> falta el precio del catalogo
--    35 tienen precio pero la UNIDAD del renglon no es la de la ficha
--       (lt vs lata, kg vs bolsa, m vs m2)   -> sesion con Sosa, renglon por renglon
--    16 tienen precio y unidad compatible    -> ESTOS, ~$1,37M
--
-- Decision del user (08/09): se tasan AL PRECIO DE HOY del catalogo, con la
-- fecha a la vista, hasta tener precio a fecha de salida (el historial arranco
-- hoy, 20260911a). Las tres guardas de 20260908w, en el WHERE:
--   precio en 0 · no cobrado · unidad_compatible(renglon, ficha)
-- El trigger de 20260911e deja un evento 'precio_cambiado' por renglon con
-- antes/despues y la fuente 'tasacion_catalogo_hoy'.

select set_config('cadinc.mcc_fuente', 'tasacion_catalogo_hoy', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id
   and coalesce(c.precio_unit, 0) = 0
   and c.cobro_id is null
   and m.precio_ref > 0
   and public.unidad_compatible(c.unidad, m.unidad);

-- El renglon del pedido acompaña (como en 20260908w): si no, la pantalla del
-- pedido sigue mostrando 0 al lado de una cuenta que ya tiene precio.
update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id
   and coalesce(i.precio_unit, 0) = 0
   and c.precio_unit > 0
   and c.updated_at >= now() - interval '5 minutes'
   and c.updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid;
