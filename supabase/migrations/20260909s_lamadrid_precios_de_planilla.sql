-- LAMADRID 566: tirante pino y sombrerete toman el precio de la planilla
--
-- Sobre el fix de 20260909q el user pidió que estos dos renglones usen el
-- precio de la planilla del cliente en vez de la valuación del sistema
-- (que había tomado el precio de la compra posterior del 07/08):
--
--   mcc 1767  Tirante pino 2x3" x 2.75m, 30u:
--             $150.210,90 (30 × $5.007,03) → $116.160 (30 × $3.872)
--   mcc 1768  Sombrerete, 3u:
--             $37.020 (3 × $12.340) → $49.800 (3 × $16.600)
--
-- Neto sobre la cuenta del cliente: −$21.270,90.

update materiales_a_cuenta_cliente
   set precio_unit = 3872, precio_total = 116160
 where id = 1767;

update materiales_a_cuenta_cliente
   set precio_unit = 16600, precio_total = 49800
 where id = 1768;
