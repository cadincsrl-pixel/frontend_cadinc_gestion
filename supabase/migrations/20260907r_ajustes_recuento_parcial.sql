-- 20260907r — Ajustes del recuento del depósito, primera tanda (user 2026-09-07)
--
-- Sosa cargó los primeros 15 ítems en la planilla interactiva
-- (https://claude.ai/code/artifact/f95bdd41-9351-4207-b2ea-2f8c1ab7a43e,
-- colección `conteo`). El user pidió ir ajustando lo que haya.
--
-- Los ajustes nacen en `estado = 'pendiente'` y NO tocan el stock hasta que
-- alguien los aprueba desde la pantalla. Es a propósito: quien cuenta no es
-- quien aprueba, y el de cemento son más de un millón de pesos.
--
-- `cantidad` es el DELTA firmado (negativo = falta, positivo = sobra), que es
-- como el schema define los ajustes.
--
-- EL NÚMERO QUE HAY QUE MIRAR: Cemento Portland x 25kg, sistema 176 contra 26
-- contados, faltan 150 bolsas (~$1.047.300). El 176 del sistema cierra: entraron
-- 265 (50+50+1+160 de compra y 4 de devoluciones) y salieron 89. O se
-- despacharon 150 sin registrar, o el conteo de ese sector quedó incompleto.
--
-- Los sobrantes son casi todos lo mismo: fichas en NEGATIVO, material que salió
-- sin haber entrado nunca. Va como `error_carga`, no como `ingreso_sin_compra`:
-- la compra existió, lo que faltó fue registrar la entrada.
--
-- QUEDA AFUERA A PROPÓSITO: "Membrana líquida x 20kg". Se contó 1 pero la
-- observación dice otra cosa — 1,5 tachos de Sikafill roja, 6,5 de Sikafill
-- blanca y 2 de Venier Supercapa gris, que es poliuretánica y ni siquiera va en
-- esa ficha. Ajustar a 1 sería cargar un dato que ya sabemos que está mal.
-- Primero hay que partir la ficha en tres.

insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
select v.material_id, 'ajuste', v.delta, 'ajuste_inventario', v.sub_motivo, 'pendiente',
       '2026-09-07', v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  (87, -150, 'faltante_fisico', 'Recuento del depósito 2026-09-07: el sistema decía 176 y se contaron 26. Falta.'),
  (301, -6, 'faltante_fisico', 'Recuento del depósito 2026-09-07: el sistema decía 32 y se contaron 26. Falta.'),
  (769, 233, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía -33 y se contaron 200. Sobra: entró al galpón sin registrarse.'),
  (317, 131, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía -1 y se contaron 130. Sobra: entró al galpón sin registrarse.'),
  (95, 80, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía -35 y se contaron 45. Sobra: entró al galpón sin registrarse.'),
  (90, 18, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía -16 y se contaron 2. Sobra: entró al galpón sin registrarse.'),
  (786, 125, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 0 y se contaron 125. Sobra: entró al galpón sin registrarse.'),
  (1013, 100, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 0 y se contaron 100. Sobra: entró al galpón sin registrarse.'),
  (950, 100, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 100 y se contaron 200. Sobra: entró al galpón sin registrarse.'),
  (339, 25, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 0 y se contaron 25. Sobra: entró al galpón sin registrarse.'),
  (179, 20, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía -2 y se contaron 18. Sobra: entró al galpón sin registrarse.'),
  (340, 10, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 47 y se contaron 57. Sobra: entró al galpón sin registrarse.'),
  (778, 10, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 0 y se contaron 10. Sobra: entró al galpón sin registrarse. Sosa aclaró que son 2 bidones de 5 litros: la ficha está por litro, así que el número va, pero el envase real es otro.'),
  (1040, 6, 'error_carga', 'Recuento del depósito 2026-09-07: el sistema decía 0 y se contaron 6. Sobra: entró al galpón sin registrarse.')
) as v(material_id, delta, sub_motivo, obs)
where not exists (
  select 1 from public.stock_movimientos mv
   where mv.material_id = v.material_id and mv.tipo = 'ajuste'
     and mv.obs like 'Recuento del depósito 2026-09-07:%');
