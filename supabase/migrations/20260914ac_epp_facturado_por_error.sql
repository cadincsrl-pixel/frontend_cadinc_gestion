-- Dos EPP que se le estan facturando a un cliente por error
--
-- El EPP es SIEMPRE gasto propio de CADINC, en toda obra (confirmado por el
-- dueno el 14/09: "epp siempre es gastos propios"). Estos dos renglones estan
-- guardados como deuda del cliente:
--
--   mcc 1236  CC PRADERAS       1 Guante latex multiuso      $3.695,00
--   mcc 2611  CC-023            3 Protector auditivo copa    $2.781,00
--                                                    total   $6.476,00
--
-- POR QUE PASO, que es lo que importa para que no se repita.
-- Los dos entraron al pedido como TEXTO LIBRE: "guantes de plastico" y
-- "protector auditivo", sin ficha. Al despacharse, calc_a_cargo_de no tenia
-- como saber que eran EPP (mira la clase de la ficha, y no habia ficha), asi
-- que la linea nacio como deuda del cliente. Correcto para lo que se sabia.
--
-- El 04/09 a las 23:13 alguien los vinculo a mano a su ficha real (652 Guante
-- latex multiuso y 647 Protector auditivo copa, las dos clase 'epp'), DESPUES
-- de que corriera el backfill de 20260904ak. Y ahi quedo: hasta el 14/09 no
-- existia ningun trigger que escuchara el vinculo con la ficha. Se recalculaba
-- al cambiar la obra y al cambiar la clase de un producto, pero no cuando un
-- renglon de texto libre por fin encontraba su ficha.
--
-- Ese hueco ya esta cerrado: trg_item_recalc_a_cargo_de (20260914aa) vigila
-- `material_id` ademas de la marca de consumible, justamente porque cambiar de
-- ficha puede cambiar la clase. De aca en adelante se arregla solo.
--
-- OJO, un no-op NO sirve: `set material_id = material_id` deja la clausula WHEN
-- del trigger en falso (old no es distinto de new) y no dispara nada. Por eso
-- el arreglo va por el mismo camino que el backfill original: pedirle el valor
-- a calc_a_cargo_de, que es la unica funcion autorizada a decidir quien paga.
-- Nunca un literal 'cadinc' escrito a mano.
--
-- Ninguna de las dos filas esta cobrada ni certificada, asi que no se
-- reinterpreta nada congelado.

update public.materiales_a_cuenta_cliente c
   set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id),
       updated_at = now()
 where c.id in (1236, 2611)
   and c.cobro_id is null
   and c.certificado_id is null
   and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
