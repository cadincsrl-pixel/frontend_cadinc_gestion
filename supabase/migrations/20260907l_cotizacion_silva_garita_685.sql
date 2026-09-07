-- 20260907l — Precios de la cotización de Silva para el pedido 685 (Garita) — user 2026-09-07
--
-- Cotización 0035-046241 de SILVA SRL, 07/09/2026, sin descuento. Sus cuatro
-- renglones son EXACTAMENTE los del pedido 685 (obra CC-025 Garita, cargado hoy),
-- con las mismas cantidades:
--
--   7792833422182  BARBIERI SOLERA 35 MM 0,52 x 2,60 MTS      16  ×  2.965,91
--   7792833421925  BARBIERI MONTANTE 34 MM 0,52 x 2,60 MTS    12  ×  3.402,11
--   009792         SUPERBOARD STANDART 6MM B.RECTO 1,20x2,40   4  × 32.167,68
--   009905         TORNILLO TEL-ALAS 8 x 1.1/4 x 100 UN        2  ×  4.252,89
--   Subtotal/Neto 225.456,38 · IVA 21 % 47.345,84 · Percepciones 5.636,40
--   TOTAL 278.438,62
--
-- Precio = unitario × 1,21 (final con IVA, sin percepciones), el mismo criterio
-- que las facturas 33/34/35 y la migración 20260907k.
--
-- DOS DE LOS CUATRO YA ESTABAN BIEN: solera (73) y montante (71) tienen hoy
-- $3.588,75 y $4.116,55, que son exactamente 2.965,91 × 1,21 y 3.402,11 × 1,21.
-- El neto no se movió entre el 05/09 y el 07/09. Solo se les anota la
-- confirmación; `precio_ref` no cambia, así que `precio_actualizado_en` queda
-- en el 05/09, que es la verdad.
--
-- LOS OTROS DOS SE CORRIGEN:
--   · Placa Superboard 6mm (284) estaba SIN PRECIO. Pasa a $38.922,89.
--   · Tornillo T2 punta mecha c/ alas (940) tenía $42,52, que es el NETO por
--     unidad (4.252,89 / 100 = 42,5289) cargado sin IVA. El precio final es
--     $51,46. Estaba 21 % por debajo.
--
-- Los cuatro renglones del pedido 685 siguen `pendiente` y sin precio propio:
-- toman la referencia al resolverse. Esta migración no los toca.

update public.stock_materiales
   set precio_ref = round(32167.68 * 1.21, 2),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: $38.922,89 final (neto $32.167,68 × 1,21) de la cotización Silva 0035-046241, '
             'código 009792 "SUPERBOARD STANDART 6MM B.RECTO 1,20 X 2,40 MT". Antes no tenía precio.',
       updated_at = now()
 where id = 284 and nombre = 'Placa Superboard 6mm';

update public.stock_materiales
   set precio_ref = round(4252.89 / 100 * 1.21, 2),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: $51,46 final por unidad, de la cotización Silva 0035-046241, código 009905 '
             '"TORNILLO TEL-ALAS 8 X 1.1/4 X 100 UN" a $4.252,89 la caja de 100. CORRIGE el $42,52 que '
             'estaba cargado: ese era el neto por unidad, sin IVA, 21 % por debajo.',
       updated_at = now()
 where id = 940 and nombre = 'Tornillo T2 punta mecha c/ alas';

-- Los dos que ya estaban bien: se anota la confirmación, no se toca el precio.
update public.stock_materiales
   set obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: confirmado por la cotización Silva 0035-046241 (mismo neto $2.965,91). Sin cambio.',
       updated_at = now()
 where id = 73 and nombre = 'Solera 35mm x 2.60m' and precio_ref = 3588.75;

update public.stock_materiales
   set obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: confirmado por la cotización Silva 0035-046241 (mismo neto $3.402,11). Sin cambio.',
       updated_at = now()
 where id = 71 and nombre = 'Montante 35mm x 2.60m' and precio_ref = 4116.55;
