-- 20260908b — Cuarta tanda del recuento, con las cintas aisladoras resueltas
-- (user 2026-09-07: "las verde son las 3M 175")
--
-- LAS CINTAS. Sosa conto 50 en la fila "sin especificar" y aclaro: "aca tenemos
-- 40 3M de las verde y 10 super 33". El user confirmo que "las verde" son las
-- 3M 175: la CAJA es verde, la cinta es negra, y en el galpon se las nombra por
-- la caja. Asi que ese 50 no va a "sin especificar" (que queda en 0, es solo
-- para renglones viejos): son 40 de la 175 y 10 de la Super 33+.
--   1546 (3M 175 negra 20m): el sistema decia 29 -- las 30 que compro ABC el
--        02/09 menos 1 despachada -- y hay 40. Faltan 11 de registrar.
--   1547 (Super 33+): nunca tuvo un movimiento y hay 10.
update public.stock_materiales
set alias = array(select distinct e from unnest(alias || array[
      'cinta verde','cinta aisladora verde','cinta 3m verde','cintas verdes']) e),
    obs = obs || ' · 2026-09-07: en el deposito se las llama "las verdes" por el color de la CAJA; la cinta es negra. El user lo confirmo al cerrar el recuento.'
where id = 1546;

-- QUEDA AFUERA A PROPOSITO: Poximix (ficha 697), sistema 13 contra 0 contado,
-- $243.771. Sosa no puso un numero y una observacion: puso 0 y pego la
-- descripcion del "Poximix Exterior". Los alias de la ficha ya dicen "poximix
-- exterior" y "poximix x 5 kg", y sus compras van de $300 a $30.000, asi que
-- adentro hay mas de una presentacion. Ajustar -13 seria cargar un dato que ya
-- sabemos que esta mal, igual que con la membrana. Primero hay que ordenar la
-- ficha.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
select v.material_id, 'ajuste', v.delta, 'ajuste_inventario', v.sub_motivo, 'pendiente',
       '2026-09-07', v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  (1546, 11,  'error_carga',     'Recuento 2026-09-07: el sistema decia 29 y se contaron 40. Sosa las anoto como "40 3M de las verde" en la fila sin especificar; el user confirmo que las verdes son las 175. Once nunca se registraron.'),
  (1547, 10,  'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 10. La ficha nunca tuvo un movimiento: entraron sin cargarse.'),
  (757,  1,   'error_carga',     'Recuento 2026-09-07: el sistema decia -1 y no hay ninguno. La ficha estaba en negativo.'),
  (811,  18,  'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 18.'),
  (107,  25,  'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 25 kg.'),
  (809,  20,  'error_carga',     'Recuento 2026-09-07: el sistema decia -1 y se contaron 19 kg.'),
  (808,  330, 'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 330. Sosa aclaro que es lo mismo que la bolsa de arpillera; la fusion de las dos fichas queda para decidir.'),
  (807,  25,  'error_carga',     'Recuento 2026-09-07: el sistema decia -1 y se contaron 24.'),
  (817,  2,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 2.'),
  (242,  2,   'error_carga',     'Recuento 2026-09-07: el sistema decia 3 y se contaron 5.'),
  (279,  17,  'error_carga',     'Recuento 2026-09-07: el sistema decia -7 y se contaron 10. La ficha estaba en negativo.'),
  (278,  17,  'error_carga',     'Recuento 2026-09-07: el sistema decia -7 y se contaron 10. La ficha estaba en negativo.'),
  (261,  25,  'error_carga',     'Recuento 2026-09-07: el sistema decia -20 y se contaron 5. La ficha estaba en negativo.'),
  (257,  20,  'error_carga',     'Recuento 2026-09-07: el sistema decia -20 m y no hay. La ficha estaba en negativo.'),
  (52,   5,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 5.'),
  (824,  2,   'error_carga',     'Recuento 2026-09-07: el sistema decia 40 y se contaron 42.'),
  (693, -4,   'faltante_fisico', 'Recuento 2026-09-07: el sistema decia 10 y se contaron 6. Faltan 4.'),
  (843, -3,   'faltante_fisico', 'Recuento 2026-09-07: el sistema decia 50 y se contaron 47. Faltan 3.'),
  (949,  0.5, 'error_carga',     'Recuento 2026-09-07: el sistema decia 2 y se contaron 2,5 (un bidon por la mitad).'),
  (822,  4,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 4.'),
  (815,  3,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 3.'),
  (827,  4,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 4.'),
  (829,  4,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 4.'),
  (835,  4,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 4.'),
  (844,  16,  'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 16.'),
  (146,  6,   'error_carga',     'Recuento 2026-09-07: el sistema decia 0 y se contaron 6.')
) as v(material_id, delta, sub_motivo, obs);
