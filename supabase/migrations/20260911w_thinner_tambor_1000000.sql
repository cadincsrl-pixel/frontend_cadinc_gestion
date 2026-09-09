-- 20260911w — Thinner: el tambor de 200 lts sale $1.000.000, no $900.000
-- (user, 08/09/2026 a la noche: "el barril de 200 litros de tiner sale 1.000.000").
-- Con 20260911m se habia tasado a $4.500/lt sobre un dato de $900.000; queda
-- $5.000/lt. Van por fijar_precio_ref (historial + fuente + usuario) y despues
-- se retasan los 9 renglones por litro que estan a $4.500 (41 lts: 8 de
-- Herreros/Praderas/CC-011 mas los 2 lts del pedido 699 de hoy), con las
-- guardas: precio exacto $4.500 · no cobrado · no certificado.

select public.fijar_precio_ref(1145, 1000000, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
select public.fijar_precio_ref(2634, 5000,    'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026 (noche): el tambor sale $1.000.000, no $900.000 (user) = $5.000/lt.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 1145;
update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026 (noche): $5.000/lt ($1.000.000 el tambor de 200 lts, user). Los renglones a $4.500 se retasaron.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 2634;

select set_config('cadinc.mcc_fuente', 'tasacion_thinner_litro_5000', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = 5000,
       precio_total = round(c.cantidad * 5000, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
 where i.id = c.item_id and i.material_id = 2634
   and c.precio_unit = 4500 and c.unidad = 'lt'
   and c.cobro_id is null and c.certificado_id is null;

update public.solicitud_compra_item i
   set precio_unit = 5000
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id = 2634
   and i.precio_unit = 4500 and c.precio_unit = 5000;
