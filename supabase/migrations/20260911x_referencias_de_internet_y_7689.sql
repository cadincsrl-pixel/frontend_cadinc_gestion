-- 20260911x — Precios de referencia buscados en internet (user 08/09: "fijate
-- precios de referencia en internet") y el nombre del color SW 7689.
--
-- Todos precio FINAL con IVA, como el resto del catalogo, fuente 'manual' con
-- la cita en obs. Ninguno reemplaza lo pagado de verdad en una compra: son la
-- referencia para tasar renglones en $0 y para la sugerencia al comprar.
--
--   129  Pincel 3"                      $9.000   ML 08/09/2026: cerda 3" entre $3.680 (basico) y
--                                                 $10.000+ (El Galgo/Plantec). CADINC pago $6.300,
--                                                 $8.700 y $9.300 en julio.
--   480  Tornillo autoperf. 14x2"       $170     por unidad. Dawerk (ML) caja x100 $13.100 = $131;
--                                                 Hierros Torrent bolsa x100 $20.250 = $202,50;
--                                                 Distribuidora Eli x300 $54.000 = $180 y x600
--                                                 $95.000 = $158 (con arandela de neoprene).
--                                                 Mediana ~ $170. CADINC pago $89 en julio.
--   1562 Disco widia 180mm              $8.700   ML: 24 dientes $8.743, 40 dientes $7.372,
--                                                 48 dientes Kleber $9.999,99.
--   906  Sika Tex 75 x rollo (26 m2)    $110.357 ML 08/09/2026 (captura del user). Referencia
--                                                 elegida por el user ("mercado libre"); las compras
--                                                 reales a Adicem/Silva fueron $30.981-$40.033 el
--                                                 rollo. El renglon 342 de CC-011 (2 rollos) queda a
--                                                 $30.981, lo que Adicem cobro esa misma semana.
--
-- SW 7689 es "Row House Tan" (sherwin-williams.com/sherwinwilliams/SW7689-row-house-tan).
-- El user: "es Loxon". La linea exacta (LD mate / Frentes) todavia no se sabe:
-- queda "Loxon" a secas hasta la foto del balde.
--
-- Despues se tasan los renglones en $0 de pincel (3241 CC-017, 2581 CC-005,
-- 350 CC-011: 1 pincel cada uno) y de tornillos (3237 CC-025: 50 unid) con
-- las tres guardas de siempre.

select public.fijar_precio_ref(129,  9000,   'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
select public.fijar_precio_ref(480,  170,    'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
select public.fijar_precio_ref(1562, 8700,   'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
select public.fijar_precio_ref(906,  110357, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $9.000 de internet (ML: cerda 3" $3.680 a $10.000+; CADINC pago $6.300/$8.700/$9.300 en julio).')
 where id = 129;
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $170/unid de internet (cajas x100 $13.100 Dawerk y $20.250 Hierros Torrent; x300 $54.000 y x600 $95.000 Distrib. Eli, con neoprene). CADINC pago $89 en julio.')
 where id = 480;
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $8.700 de internet (ML: 24 dientes $8.743, 40 dientes $7.372, 48 dientes Kleber $9.999).')
 where id = 1562;
update public.stock_materiales set updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
   obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $110.357 el rollo de 1,05 x 25 m (Mercado Libre, captura del user). Las compras a Adicem/Silva fueron $30.981-$40.033.')
 where id = 906;

update public.stock_materiales
   set nombre = 'Látex exterior Loxon SW 7689 Row House Tan x 20lts',
       alias  = array(select distinct x from unnest(alias || array['row house tan','loxon 7689','loxon row house tan','loxon sw 7689','loxon exterior 7689']) x order by x),
       obs    = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: es Loxon (user); SW 7689 = "Row House Tan" (sherwin-williams.com). Falta saber si es LD mate o Frentes: foto del balde.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 946 and nombre = 'Látex exterior SW 7689 x 20lts';

select set_config('cadinc.mcc_fuente', 'tasacion_catalogo_hoy', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and m.id in (129, 480)
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id in (129, 480)
   and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0
   and c.updated_at >= now() - interval '5 minutes'
   and c.updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid;
