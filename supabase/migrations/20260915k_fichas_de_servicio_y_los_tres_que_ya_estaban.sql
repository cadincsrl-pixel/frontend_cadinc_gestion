-- Las primeras fichas de servicio, y los tres que ya estaban cargados a mano
--
-- Segunda mitad de 20260915j (ahí se ensanchó `clase`). Acá se crean las fichas
-- y se reclasifican los servicios que el equipo venía cargando como materiales.
--
-- SÓLO TRES FICHAS, Y TODAS CON EVIDENCIA. No se pre-genera la grilla de
-- servicios posibles: es la lección de las pinturas por color (de 62 fichas, 50
-- no tuvieron nunca un movimiento). Cada una sale de algo que ya pasó:
--
--   Flete / envío                 lo pidió el user hoy: "acabo de retirar un
--                                 bulto de via cargo para una obra"
--   Alquiler de volquete          CC-016, $140.000 el 27/08
--   Corte y plegado de chapa      CC-027 corte de canaletas $726.000 el 14/09
--                                 CC-006 plegado chapa 18 $435.600 el 21/08
--
-- Corte y plegado van en UNA ficha: son el mismo servicio de taller de chapa y
-- el precio sale de la factura cada vez, así que separarlas sería inventar una
-- distinción que los datos no piden.
--
-- SIN PRECIO DE REFERENCIA, a propósito: un flete no tiene precio de lista, sale
-- lo que sale según el bulto y el destino. El precio entra con la compra.
--
-- OJO CON LOS ALIAS: "plegado" suelto choca con la ficha 2685 "plegadora
-- manual", que es una herramienta. Por eso va "plegado de chapa", de dos
-- palabras. Los 11 alias del flete y los 6 de cada uno de los otros dos se
-- verificaron contra las fichas activas: 0 colisiones.
--
-- LOS TRES RENGLONES VIEJOS. Dos están COBRADOS (cobro 7 y 15), así que la
-- reclasificación se probó antes con arnés de rollback: cambiar material_id
-- dispara trg_item_recalc_a_cargo_de, y las tres obras devuelven 'cliente', que
-- es lo que ya tenían. No se mueve un peso, no se suelta ningún cobro y
-- fn_mcc_congelada no se activa porque no se tocan ni precio ni cantidad.

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
select r.id, 'Flete / envío (servicio)', 'unid', 'servicio', true, false, 0, 0, 0,
  array['flete','fletes','envio','envios','via cargo','viacargo','correo','transporte','acarreo','flete y envio','costo de envio'],
  'Alta 15/09/2026 (20260915k). Servicio: entra a la cuenta de la obra como cualquier renglon y respeta a cargo de cliente o CADINC, pero no tiene stock ni pasa por el deposito. Sin precio de referencia: sale lo que sale segun el bulto y el destino.'
from stock_rubros r where lower(r.nombre) = 'servicios';

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
select r.id, 'Alquiler de volquete / contenedor (servicio)', 'unid', 'servicio', true, false, 0, 0, 0,
  array['volquete','volquetes','alquiler de volquete','contenedor','contenedores','alquiler de contenedores'],
  'Alta 15/09/2026 (20260915k). Sale de CC-016, $140.000 el 27/08, que estaba cargado como material.'
from stock_rubros r where lower(r.nombre) = 'servicios';

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
select r.id, 'Corte y plegado de chapa (servicio de taller)', 'unid', 'servicio', true, false, 0, 0, 0,
  array['corte de chapa','plegado de chapa','corte y plegado','corte de canaleta','corte de canaletas','plegado chapa'],
  'Alta 15/09/2026 (20260915k). Una sola ficha para las dos operaciones: son el mismo taller de chapa y el precio sale de la factura cada vez. Sale de CC-027 (corte de canaletas $726.000) y CC-006 (plegado chapa 18 $435.600).'
from stock_rubros r where lower(r.nombre) = 'servicios';

-- Los tres renglones que ya estaban, a su ficha.
update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Corte y plegado de chapa (servicio de taller)'),
       clase = 'servicio',
       obs = coalesce(obs || ' · ', '') ||
             'Reclasificado el 15/09 (20260915k): es un servicio de taller, no un material. Estaba sin ficha.'
 where id in (2639, 3834) and material_id is null;

update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Alquiler de volquete / contenedor (servicio)'),
       clase = 'servicio',
       obs = coalesce(obs || ' · ', '') ||
             'Reclasificado el 15/09 (20260915k): es un servicio, no un material. Estaba sin ficha.'
 where id = 3514 and material_id is null;
