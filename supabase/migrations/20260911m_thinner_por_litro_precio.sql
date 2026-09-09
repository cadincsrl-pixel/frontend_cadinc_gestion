-- 20260911m — El thinner tiene precio: tambor de 200 lts a $900.000 (user,
-- 08/09/2026) = $4.500 el litro, igual que el aguarras.
--
-- Va por fijar_precio_ref (20260911c) para que quede en el historial con
-- fuente y usuario, y no por UPDATE directo. Se actualiza tambien la ficha
-- del tambor (1145), que tenia $653.183,45 de la factura Prestigio del 21/05.
-- Despues se tasan los 8 renglones de thinner por litro que quedaron en $0 en
-- 20260911k (39 lts, casi todos de Herreros), con las tres guardas.

select public.fijar_precio_ref(2634, 4500, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
select public.fijar_precio_ref(1145, 900000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: $4.500/lt. El tambor es de 200 lts y sale $900.000 (user).')
 where id = 2634;
update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: $900.000 el tambor de 200 lts (user). Se despacha por litro: ficha 2634.')
 where id = 1145;

select set_config('cadinc.mcc_fuente', 'tasacion_thinner_litro', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and m.id = 2634
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id = 2634
   and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0;
