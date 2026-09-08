-- LAMADRID 566: los tornillos T1 del 14/08 según la factura real — el ×10 era cierto
--
-- Ayer (20260909u) se cargó el renglón "Tornillos T1 (compra del 14/08 fuera
-- del sistema)" con los números de la planilla del capataz: 200 u, $64.856,
-- dejando anotada la sospecha de un error ×10 ($324/u contra los ~$32 que
-- vale un T1 en el resto de la cuenta).
--
-- La factura A 0025-00025590 de SILVA SRL (14/08/2026) lo confirma:
--   TORNILLO T1 MECHA 8 x 9/16" x 100 UN TEL — 1 caja de 100 unidades
--   neto $2.628,93 + IVA $552,08 + percepciones $65,72 = $3.246,73, pagada
--   en cuenta corriente.
--
-- O sea: eran 100 unidades (no 200) y $32,47 el tornillo (no $324). El
-- renglón (mcc 3283 / item 3513) toma la factura. Efecto: −$61.609,27.

update solicitud_compra_item
   set cantidad = 100,
       precio_unit = 32.47,
       proveedor_id = 4,
       obs = 'Corregido el 08/09 con la factura SILVA A 0025-00025590 (14/08): 1 caja de 100 T1, $3.246,73 final. La planilla del capataz decia 200 u / $64.856 — error x10 confirmado.'
 where id = 3513;

update materiales_a_cuenta_cliente
   set cantidad = 100,
       precio_unit = 32.47,
       precio_total = 3246.73,
       proveedor_id = 4,
       updated_at = now()
 where id = 3283 and obra_cod = 'CC-016';
