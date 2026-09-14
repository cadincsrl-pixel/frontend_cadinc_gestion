-- El renglón 3450 del pedido de depósito de Sosa (solicitud 661) dice "Disco diamantado
-- 115mm", 20 unidades, y estaba vinculado a la ficha 441, que es el "Disco widia turbo
-- fino p/ porcelanato 115mm (Aliafor verde)" de $24.000 — el disco más caro del catálogo.
--
-- El user mandó la foto del que compran y confirmó: es el TURBO de la línea amarilla de
-- Patroll, o sea la ficha 2648, a $9.500. Sobre 20 unidades la diferencia entre una y
-- otra es de $290.000.
--
-- Seguro de hacer: el renglón está `pendiente`, sin `precio_unit`, así que todavía no
-- tocó `materiales_a_cuenta_cliente`. Se revierte volviendo el material_id a 441.
--
-- NO se tocan los 6 renglones históricos que también cayeron en la 441 con descripción
-- genérica (ids 3480, 3060, 3013, 2808, 2743, 2385): están `enviado`, con su precio real
-- ya escrito en la cuenta, y moverlos reescribiría registros cerrados. Queda anotado en
-- el diario como cosa a revisar aparte: sus precios de compra reales fueron de $3.207 a
-- $4.200, que no se parecen ni a los $24.000 de la 441 ni a los $9.500 de la 2648.

update public.solicitud_compra_item
   set material_id = 2648
 where id = 3450 and material_id = 441 and estado = 'pendiente' and precio_unit is null;
