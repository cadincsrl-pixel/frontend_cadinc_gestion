-- 20260907x — Ajustes del recuento del depósito, tercera tanda (user 2026-09-07)
--
-- Sosa cargó 25 ítems más. 5 coinciden con el sistema y no generan nada:
-- fenólico 18mm, solera 35mm, revoque fino interior, pegamento p/ cerámicos y
-- larguero de cielorraso, todos 0 contra 0.
--
-- Los 20 que difieren van acá, `pendiente` como siempre. `cantidad` es el DELTA.
--
-- TODOS van como `error_carga`, ninguno como `faltante_fisico`. No es
-- indulgencia: en los tres casos grandes hay evidencia de que el material está,
-- mal fichado, y no de que falte.
--
-- 1) LOS TORNILLOS SON UNA SOLA COMPRA REPARTIDA EN CUATRO FICHAS.
--    Las únicas entradas de tornillo del sistema son 21.000 unidades compradas
--    al depósito en mayo/junio (10.000 + 1.000 + 10.000, $25 c/u), las tres
--    descriptas "Tornillo T1 autoperforante" y las tres cargadas contra la
--    ficha 76, que es punta AGUJA. Autoperforante es punta mecha, no aguja.
--    Las otras tres fichas (763, 77, 940) sólo tienen salidas — por eso están
--    en negativo. Sosa contó 500 + 5.000 + 10.000 + 2.000 = 17.500 contra
--    20.020 de saldo real (21.000 menos 980 despachados): el faltante de
--    verdad es ~2.500 unidades, no los 20.300 que parece mirando la 76 sola.
--
-- 2) LAS 25 BOLSAS DE "REVOQUE FINO EXTERIOR" SON LAS WEBER EXTRA BLANCO.
--    La 723 tenía 25 en stock de una sola entrada del 19/08 y se contaron 0.
--    La 785 (fino interior) también dio 0. Y la ficha nueva 1567, que se abrió
--    hoy con la foto del envase, dio 37. Es el mismo material: las 25 entraron
--    mal fichadas y las otras 12 nunca se registraron. La 723 no pierde plata,
--    la cambia de ficha. Falta decidir si se fusionan (ver diario 07/09).
--
-- 3) El resto repite el patrón de las dos tandas anteriores: fichas en negativo
--    porque el material salió sin haber entrado nunca.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
select v.material_id, 'ajuste', v.delta, 'ajuste_inventario', 'error_carga', 'pendiente',
       '2026-09-07', v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  -- tornillos: una compra, cuatro fichas
  (76,  -20300, 'Recuento 2026-09-07: el sistema decía 20.800 y se contaron 500. NO es un faltante de $561.000: las 21.000 unidades compradas en mayo/junio como "T1 autoperforante" se cargaron todas acá (punta aguja) y en el galpón están repartidas en los cuatro tipos. Ver los ajustes hermanos de las fichas 763, 77 y 940.'),
  (763,   5080, 'Recuento 2026-09-07: el sistema decía -80 y se contaron 5.000. La ficha nunca tuvo una entrada: son tornillos de la compra cargada en la ficha 76.'),
  (77,   10050, 'Recuento 2026-09-07: el sistema decía -50 y se contaron 10.000. La ficha nunca tuvo una entrada: son tornillos de la compra cargada en la ficha 76.'),
  (940,   2500, 'Recuento 2026-09-07: el sistema decía -500 y se contaron 2.000. La ficha nunca tuvo una entrada: son tornillos de la compra cargada en la ficha 76.'),
  -- revoque fino: las 25 de la 723 son las Weber
  (723,    -25, 'Recuento 2026-09-07: el sistema decía 25 y se contaron 0. No falta: son las bolsas de Weber extra blanco, que se contaron en la ficha 1567. La entrada del 19/08 quedó mal fichada.'),
  (1567,    37, 'Recuento 2026-09-07: primera carga de la ficha. 25 vienen de la 723 (mal fichadas al entrar el 19/08) y 12 nunca se registraron.'),
  -- el resto: fichas en negativo o en cero que tenían material
  (323,     29, 'Recuento 2026-09-07: el sistema decía -28 y se contó 1. Entraron bolsas que nunca se cargaron.'),
  (71,      65, 'Recuento 2026-09-07: el sistema decía -30 y se contaron 35. Entraron unidades que nunca se cargaron.'),
  (68,      10, 'Recuento 2026-09-07: el sistema decía 0 y se contaron 10.'),
  (83,      15, 'Recuento 2026-09-07: el sistema decía -15 y se contó 0. La ficha estaba en negativo.'),
  (777,     16, 'Recuento 2026-09-07: el sistema decía -5 y se contaron 11. Entraron bolsas que nunca se cargaron.'),
  (790,      9, 'Recuento 2026-09-07: el sistema decía -2 y se contaron 7.'),
  (1563,    13, 'Recuento 2026-09-07: el sistema decía 0 y se contaron 13.'),
  (888,      6, 'Recuento 2026-09-07: el sistema decía -6 y se contó 0. La ficha estaba en negativo.'),
  (745,      3, 'Recuento 2026-09-07: el sistema decía 0 y se contaron 3.'),
  (772,      2, 'Recuento 2026-09-07: el sistema decía 0 y se contaron 2.'),
  (79,       4, 'Recuento 2026-09-07: el sistema decía -1 y se contaron 3.'),
  (911,    106, 'Recuento 2026-09-07: el sistema decía -6 y se contaron 100.'),
  (774,     11, 'Recuento 2026-09-07: el sistema decía 0 y se contaron 11.'),
  (784,     16, 'Recuento 2026-09-07: el sistema decía -15 y se contó 1. La ficha estaba en negativo.')
) as v(material_id, delta, obs);
