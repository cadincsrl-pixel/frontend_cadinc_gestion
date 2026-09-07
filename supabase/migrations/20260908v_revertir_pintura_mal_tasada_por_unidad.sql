-- 20260908p — Se revierte la parte de 20260908m que quedo mal: renglones
-- cargados en LITROS o KILOS tasados al precio de la LATA o del BALDE.
--
-- ERROR PROPIO, detectado al auditar las fichas cuya unidad no coincide con la
-- de sus renglones. En 20260908m se aplico el precio de referencia a todo el
-- rubro Pintura sin mirar la unidad del renglon. Para los que decian "unid" o
-- "lata" esta bien. Para los que decian "lt" o "kg" NO: multiplica por la
-- presentacion entera.
--
--   CC CADINC 1  Latex satinado x 20lts   30 "lt"  ->  $7.413.984,60
--   CC LOGISTICA Latex satinado x 20lts   20 "lt"  ->  $4.942.656,40
--   cc 08        Latex cielorraso x 20lts 20 "lt"  ->  $2.176.711,80
--   cc 08        Enduido x 25kg           20 "kg"  ->  $1.253.900,00
--   CC CADINC 1  Enduido x 25kg            8 "kg"  ->  $  501.560,00
--   + diluyente y aguarras en "lt"                 ->  ~$  984.000
--                                          TOTAL   ->  $17.273.309,73
--
-- Si esos "30 lt" son 30 LITROS (1,5 latas), lo correcto serian $370.699 y no
-- $7,4 M: un factor de 20. Y el sistema usa "lt" en serio -- se vio hoy con la
-- Sikafill (renglones en litros a $6.350) y con el acido muriatico (7 de 9
-- renglones en "lt").
--
-- NO se calcula el precio dividido por la presentacion: seria adivinar sobre lo
-- que ya adivine mal una vez. Vuelven a $0, que es el estado honesto, con la
-- cuenta hecha en la observacion para que resolverlo sea leer una linea.
--
-- Ninguno de los 17 esta cobrado. Los 2 renglones de Albañileria con el mismo
-- problema (Yeso x 25kg y Puente de adherencia, uno YA COBRADO) NO se tocan:
-- son anteriores y uno tiene cobro imputado.
update public.solicitud_compra_item i
set precio_unit = 0,
    obs = coalesce(i.obs || ' · ', '') ||
      'REVISAR UNIDAD: el renglon esta en "' || i.unidad || '" y la ficha se mide por "' ||
      sm.unidad || '". El 07/09 se le aplico el precio de referencia ($' ||
      to_char(sm.precio_ref, 'FM999G999G999D00') || ' por ' || sm.unidad ||
      ') y quedo mal; se revirtio a 0. Si la cantidad es la presentacion entera, el precio va como esta; si son ' ||
      i.unidad || ' sueltos, hay que dividirlo por el contenido del envase.'
from public.stock_materiales sm, public.stock_rubros r
where sm.id = i.material_id and r.id = sm.rubro_id and r.nombre = 'Pintura'
  and i.unidad in ('lt','kg') and sm.unidad in ('lata','balde','bolsa','rollo')
  and i.precio_unit = sm.precio_ref and i.precio_unit > 0;

update public.materiales_a_cuenta_cliente m
set precio_unit = 0, precio_total = 0
from public.solicitud_compra_item i, public.stock_materiales sm, public.stock_rubros r
where i.id = m.item_id and sm.id = i.material_id and r.id = sm.rubro_id and r.nombre = 'Pintura'
  and m.unidad in ('lt','kg') and sm.unidad in ('lata','balde','bolsa','rollo')
  and m.precio_unit = sm.precio_ref and m.precio_unit > 0
  and m.cobro_id is null;
