-- FARMACIA AMERICA (CC-023): los tres precios exageradamente baratos
--
-- Barrido de "cosas baratas" del 08/09, decisiones del user:
--   1. Disco diamantado continuo 115mm (mcc 3134): $3.850 → $13.925
--      (la mediana de sus 14 ventas en otras obras).
--   2. Arena x 25kg (mcc 2770 x40 y 3132 x8): $1.500 → $4.500. El user:
--      "no sé por qué se puso a 1500" — venía así de los despachos, no de
--      ningún ajuste (la arena de LAMADRID a $1.500 es decisión aparte,
--      cada obra tiene su precio).
--   3. Mandil de trabajo (mcc 2771 x3): $650 → $2.394 (mediana otras obras).
--
-- Efecto total: +$159.307 (disco +10.075, arena +144.000, mandil +5.232).

update materiales_a_cuenta_cliente set precio_unit = 13925, precio_total = 13925,  updated_at = now() where id = 3134 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 4500,  precio_total = 180000, updated_at = now() where id = 2770 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 4500,  precio_total = 36000,  updated_at = now() where id = 3132 and obra_cod = 'CC-023';
update materiales_a_cuenta_cliente set precio_unit = 2394,  precio_total = 7182,   updated_at = now() where id = 2771 and obra_cod = 'CC-023';
