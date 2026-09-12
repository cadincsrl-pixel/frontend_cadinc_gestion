-- Las hojas de Cristian se compran por resma, no por hoja
-- =======================================================
-- 2026-09-12
--
-- El renglon 3789 (pedido 752, CC DEPOSITO, cargado por Cristian Sosa el
-- 11/09) pedia "hojas para impresora", 1 unid, y habia creado por texto libre
-- la ficha 2689 con ese mismo nombre. Se compra y se despacha por RESMA de 500
-- hojas: "1 unid" de hojas sueltas no significa nada y el que va a comprar no
-- sabe si son 1 o 500.
--
-- Se corrige en la ficha Y en el renglon, que todavia estaba `pendiente`.
--
-- LA UNIDAD SIGUE SIENDO 'unid' A PROPOSITO: no existe 'resma' entre las
-- unidades del catalogo (unid, m, lata, m2, rollo, bolsa, kg, balde, tn, lt,
-- m3) y agregarla obligaria a tocar el selector del frontend. La convencion
-- mayoritaria del catalogo es justo esta —la presentacion va en el NOMBRE y la
-- unidad queda en 'unid'—, igual que "Pastina x 5kg" o "Sellador PU Sikaflex
-- 1A Plus x 300ml". 2.106 de 2.485 fichas activas lo hacen asi.
--
-- Cambiar la unidad aca seria seguro de todos modos: la ficha no tiene ningun
-- movimiento ni renglon en la cuenta del cliente, asi que no hay nada viejo que
-- reinterpretar (el peligro de §5.15). Pero no hace falta.
--
-- Sin precio (§5.15): queda en la lista de pendientes de tasar.
--
-- Los alias NO incluyen "hoja" ni "hojas" sueltos a proposito: el matcher es
-- substring y contaminarian "Hoja de trincheta", "tijera de hojalatero" y las
-- chapas, que se fichan "(hoja)". Se conserva "hojas para impresora", que es
-- como lo escribio Cristian, para que lo siga encontrando.

update stock_materiales set
  nombre = 'Resma de hojas A4 (500 hojas)',
  alias = array['hojas para impresora','papel para impresora','hojas impresora','resma',
                'resma a4','resma de hojas','resma de papel','resma 500','resma 500 hojas',
                'hojas a4','papel a4','hojas resma'],
  obs = 'Corregida 2026-09-12: nacio del texto libre como "hojas para impresora". Se compra y se despacha por RESMA de 500, no por hoja suelta.',
  updated_at = now()
where id = 2689;

update solicitud_compra_item
   set descripcion = 'Resma de hojas A4 (500 hojas)'
 where id = 3789 and estado = 'pendiente';

do $$
declare v_n integer;
begin
  select count(*) into v_n from stock_materiales
   where id = 2689 and nombre = 'Resma de hojas A4 (500 hojas)' and unidad = 'unid';
  if v_n <> 1 then raise exception 'La ficha 2689 no quedo corregida'; end if;

  select count(*) into v_n from solicitud_compra_item
   where id = 3789 and descripcion = 'Resma de hojas A4 (500 hojas)';
  if v_n <> 1 then raise exception 'El renglon 3789 no quedo corregido (ya no estaba pendiente?)'; end if;
end $$;
