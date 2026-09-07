-- 20260907o — Tres pares de fichas duplicadas del catálogo (user 2026-09-07)
--
-- Salieron de la auditoría de sinónimos (`20260907n`): tres alias apuntaban a
-- dos fichas cada uno porque las fichas eran el mismo producto. El user pidió
-- verlos y después aplicar la fusión.
--
-- Fusionar = la ficha que sobrevive se queda con los alias y los renglones, y
-- la otra pasa a `activo = false` (baja lógica, igual que `deleteMaterial`).
-- No se borra ninguna fila: los renglones históricos siguen existiendo.
--
--   1) 62   Fotocelda                      → baja, gana 1166 Fotocélula
--   2) 977  Ventilación gas 15x30          → baja, gana  931 Rejilla de vent.
--   3) 1245 Térmica tetrapolar 4x32A       → baja, gana 1429 Térmica 4x32A sin marca
--
-- Verificado antes de tocar: 62 y 977 no tienen renglones, ni movimientos de
-- stock, ni entregas de pañol. 1245 tiene UN renglón (108) con su fila en la
-- cuenta del cliente, sin cobrar.

-- ═══ 1) Fotocelda → Fotocélula ═════════════════════════════════════════════
-- Son el mismo interruptor crepuscular. La 62 es de la carga inicial de abril:
-- sin precio, sin uso, y su único alias ('fotocelula') ya está en la 1166, que
-- tiene la compra real a VOLTAJE para Villaguay (12/08, $12.000).
update public.stock_materiales
   set activo = false,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: baja por duplicada. Es la misma que "Fotocélula (interruptor crepuscular)" (1166), '
             'que tiene la compra real y el precio. Nunca tuvo renglones.',
       updated_at = now()
 where id = 62 and nombre = 'Fotocelda';

-- ═══ 2) Ventilación gas 15x30 → Rejilla de ventilación 15x30 ═══════════════
-- Las dos nacieron de LA MISMA compra: El Fontanero, 02/09/2026, $3.284,38 al
-- centavo. La 931 se creó el 03/09 desde el pedido y la 977 el 04/09 al
-- importar el Excel de esa misma compra. La 977 nunca tuvo renglones.
--
-- La que sobrevive es la 931 (tiene los 2 renglones y el nombre correcto: lo
-- que importa de esta rejilla es que sea la APROBADA de 200 cm²), pero se
-- queda con los alias de la 977 y se muda al rubro de gas, que es donde la
-- busca quien la necesita: la ventilación aprobada es requisito de gas, no de
-- sanitaria.
update public.stock_materiales
   set rubro_id = 12,   -- Instalación de gas
       alias = array(select distinct x from unnest(
                 alias || array['rejilla vent. aprob. 15 x 30 (200 cm2)','ventilacion 200 cm2','rejilla de gas 15x30']) x),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: absorbe a "Ventilación gas 15x30 (200cm²)" (977), que era la misma compra de El '
             'Fontanero del 02/09 cargada dos veces (una desde el pedido, otra desde el Excel). Pasa de '
             'Sanitaria a Instalación de gas: la ventilación aprobada de 200 cm² es requisito de gas.',
       updated_at = now()
 where id = 931;

update public.stock_materiales
   set activo = false,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: baja por duplicada. Misma compra (El Fontanero 02/09, $3.284,38) que la 931, '
             'cargada dos veces. Sus alias se mudaron a la 931. Nunca tuvo renglones.',
       updated_at = now()
 where id = 977 and nombre = 'Ventilación gas 15x30 (200cm²)';

-- ═══ 3) Térmica tetrapolar 4x32A → Térmica 4x32A sin marca ═════════════════
-- No fue un descuido sino un choque de criterios: la 1245 es un alta suelta del
-- 05/09 con el precio de una compra real; la 1429 es la fila genérica de la
-- escalera de térmicas que se armó el 06/09 (una por calibre + una por marca).
-- Sobrevive la de la escalera, que es el sistema, y se lleva el precio real y
-- el renglón. Referencias del mismo calibre: Sica 4x32 $22.800, ABB 4x32
-- $47.200; los $36.714,77 caen en el medio, creíbles para una sin marca.
update public.stock_materiales
   set precio_ref = 36714.77,
       alias = array(select distinct x from unnest(
                 alias || array['llave termica tetrapolar curva c 32 amper','llave tetrapolar 32a']) x),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: absorbe a "Térmica tetrapolar 4x32A" (1245). Toma su precio, que es el de la '
             'compra real a VOLTAJE para Valle Fértil (01/06/2026, 2 unidades a $36.714,77).',
       updated_at = now()
 where id = 1429;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Fusión de fichas duplicadas: "Térmica tetrapolar 4x32A" (1245) pasa a "Térmica 4x32A sin marca" '
       '(1429), la genérica de la escalera de térmicas. No cambia cantidad ni precio.',
       jsonb_build_object('motivo','fusion fichas duplicadas 2026-09-07',
                          'material_anterior', 1245, 'material_nuevo', 1429)
from public.solicitud_compra_item i where i.id = 108 and i.material_id = 1245;

update public.solicitud_compra_item
   set material_id = 1429, descripcion = 'Térmica 4x32A sin marca'
 where id = 108 and material_id = 1245;

-- La fila de la cuenta del cliente sigue el nombre. NO se toca ningún importe:
-- cantidad 2 × $36.714,77 = $73.429,54, sin cobrar.
update public.materiales_a_cuenta_cliente
   set descripcion = 'Térmica 4x32A sin marca', updated_at = now()
 where item_id = 108;

update public.stock_materiales
   set activo = false,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: baja por duplicada. Su renglón (108, Valle Fértil) y su precio pasaron a '
             '"Térmica 4x32A sin marca" (1429), la fila genérica de la escalera de térmicas.',
       updated_at = now()
 where id = 1245 and nombre = 'Térmica tetrapolar 4x32A';
