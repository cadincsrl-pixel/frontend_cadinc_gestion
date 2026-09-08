-- LAMADRID 566: la compra de Escudero (20/08) estaba cargada SIN IVA
--
-- Factura A 0004-00008393 de ESCUDERO REFRIGERACIONES (20/08/2026, retiró
-- Franco Díaz): material del aire acondicionado. Neto $33.265,98 + IVA
-- $6.985,86 = $40.251,84.
--
-- Los 7 renglones del sistema copiaron los importes de la factura, que son
-- NETOS — y la convención del MCC es precio FINAL con IVA (es el caso típico
-- de la memoria "muchas compras están sin IVA por error"). Se multiplican
-- por 1,21; el total de los 7 pasa de $33.265,98 a $40.251,84 (+$6.985,86).
--
--   2452 Caño cobre 1/4      15.137,80 → 18.316,74
--   2453 Aislante 1/4 ×2        810,00 →    980,10 /u
--   2454 Aislante 5/8 ×2      1.579,50 →  1.911,20 /u
--   2455 Cable taller ×4      2.412,61 →  2.919,26 /u (total 11.677,03)
--   2456 Cinta PVC            1.772,62 →  2.144,87
--   2457 Cinta aisladora      1.641,12 →  1.985,76
--   2458 Tornillo T3 ×10         28,50 →     34,49 /u (total 344,85)
--
-- La MÉNSULA (mcc 2451, $14.571,07, también Escudero) NO está en esta
-- factura: es de otro ticket. No se toca hasta ver ese comprobante.

update materiales_a_cuenta_cliente set precio_unit = 18316.74, precio_total = 18316.74, updated_at = now() where id = 2452;
update materiales_a_cuenta_cliente set precio_unit =   980.10, precio_total =  1960.20, updated_at = now() where id = 2453;
update materiales_a_cuenta_cliente set precio_unit =  1911.20, precio_total =  3822.39, updated_at = now() where id = 2454;
update materiales_a_cuenta_cliente set precio_unit =  2919.26, precio_total = 11677.03, updated_at = now() where id = 2455;
update materiales_a_cuenta_cliente set precio_unit =  2144.87, precio_total =  2144.87, updated_at = now() where id = 2456;
update materiales_a_cuenta_cliente set precio_unit =  1985.76, precio_total =  1985.76, updated_at = now() where id = 2457;
update materiales_a_cuenta_cliente set precio_unit =    34.49, precio_total =   344.85, updated_at = now() where id = 2458;

update solicitud_compra_item i
   set precio_unit = c.precio_unit,
       obs = coalesce(i.obs || ' · ', '') ||
             'Precio pasado a final con IVA el 08/09 con la factura Escudero A 0004-00008393 (venia cargado neto).'
  from materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id in (2452, 2453, 2454, 2455, 2456, 2457, 2458);
