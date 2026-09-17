-- Misión Salta, Áridos y Arcor Canaleta fueron llave en mano
--
-- El user, 17/09, recorriendo el resumen de todas las obras: "mision salta
-- era llave en mano, aridos es llave en mano, arcor canaleta llave en mano".
-- Con Pinar 2 (20260917i) y Kotch (20260917k) son CINCO obras de presupuesto
-- cerrado que estaban mal clasificadas y se vieron el día que existió el
-- resumen. Estaban con materiales al cliente y figuraban debiendo:
--
--   CC-009  Mision Salta    (archivada)   24 renglones   $  315.665,75
--   CC-020  ARIDOS                         1 renglón     $  144.000,00
--   CC-027  ARCOR CANALETA                14 renglones   $3.189.417,23
--                                                        ─────────────
--                                                        $3.649.083
--
-- que no iban a cobrarse. `trg_obras_recalc_a_cargo_de` pasa los 39 a gasto
-- de CADINC. Sin cobros, certificados ni renglones congelados en ninguna de
-- las tres. Probado con rollback antes de aplicar.
--
-- Nota sobre Arcor Canaleta: la corrección de la chapa C16 del 14/09
-- (20260914aj, −$21.841,20 "a ARCOR") sigue valiendo — ahora como costo
-- exacto de la obra en vez de deuda exacta del cliente.

update public.obras
   set materiales_a_cargo_de = 'cadinc',
       updated_at = now()
 where cod in ('CC-009', 'CC-020', 'CC-027')
   and materiales_a_cargo_de = 'cliente';
