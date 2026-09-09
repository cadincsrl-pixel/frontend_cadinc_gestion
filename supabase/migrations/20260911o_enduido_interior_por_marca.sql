-- 20260911o — El enduido interior, por marca y presentacion (fotos del user,
-- 08/09/2026): Prinz enduido plastico al agua x 20 L, Venier enduido plastico
-- interior x 20 L, Sherwin Williams enduido plastico interior multiproposito
-- x 25 kg. Habia UNA ficha, "Enduido interior x 25kg" (118), y ninguna compra
-- decia la marca. Mismo patron que las pinturas por marca.
--
-- La 118 conserva su historia y su precio ($62.695) como la Sherwin de 25 kg.
-- Las dos de 20 L nacen sin precio: se cargan con la primera compra real
-- (hay una de Silva del 31/07 a $2.745 el litro, 20 lt = $54.900, sin marca).
-- El stock por marca hay que volver a contarlo: el recuento del 08/09 conto
-- "1 balde" sobre la ficha unica y las fotos muestran los tres.

update public.stock_materiales
   set nombre = 'Enduido plástico interior Sherwin Williams x 25kg',
       alias  = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || array['enduido sherwin', 'enduido sherwin 25', 'enduido interior 25 kg', 'enduido plastico interior multiproposito']) a),
       obs    = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: pasa a ser la Sherwin Williams de 25 kg. Las de 20 L (Prinz, Venier) tienen ficha propia.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 118;

insert into public.stock_materiales (rubro_id, nombre, unidad, stock_minimo, precio_ref, obs, alias, usa_color, clase, activo, created_by, updated_by)
select m.rubro_id, v.nombre, 'balde', 0, 0, v.obs, v.alias, false, 'material', true,
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.stock_materiales m
  cross join (values
    ('Enduido plástico interior Prinz x 20lts',
     'Creada el 08/09/2026 desde la foto del deposito: Prinz, enduido plastico al agua, interior, 20 L. Sin precio: se carga con la primera compra.',
     array['enduido prinz', 'enduido prinz 20', 'prinz enduido', 'enduido interior 20 litros']),
    ('Enduido plástico interior Venier x 20lts',
     'Creada el 08/09/2026 desde la foto del deposito: Venier, enduido plastico interior 100% acrilico antihongos, 20 L. Sin precio: se carga con la primera compra.',
     array['enduido venier', 'enduido venier 20', 'venier enduido'])
  ) as v(nombre, obs, alias)
 where m.id = 118
   and not exists (select 1 from public.stock_materiales x where x.nombre = v.nombre);

-- El alias generico "enduido" tiene que ofrecer las TRES, no caer solo en la
-- Sherwin (mismo criterio que "codo de 32": obligar a elegir).
update public.stock_materiales
   set alias = (select array_agg(distinct a) from unnest(alias || array['enduido', 'enduido interior', 'tacho de enduido', 'tachos de enduido']) a),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where nombre in ('Enduido plástico interior Prinz x 20lts', 'Enduido plástico interior Venier x 20lts');
