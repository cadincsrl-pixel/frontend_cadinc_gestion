-- LAMADRID 566: a Ardiles le pagaron de menos la semana del 21/08
--
-- Del cruce con la planilla del cliente (08/09): la semana 21/08-27/08 es la
-- ÚNICA de mano de obra que no calza — planilla $755.000 vs sistema $686.000.
-- El user confirmó que la diferencia son horas de Ardiles que no se cargaron:
-- "sumale las horas hasta completar a eso a ardiles que le pagaron de menos".
--
-- Ardiles (leg 074, categoría 1, vh global $4.900 esa semana — CC-016 no
-- tiene tarifa propia para su categoría) tiene 50 hs cargadas (10 por día,
-- vie 21 a jue 27) = $245.000. Para llegar a +$69.000 con el redondeo
-- canónico per-leg al mil (round(hs × vh / 1000) × 1000):
--
--   50 + 14 = 64 hs × $4.900 = $313.600 → redondea a $314.000 = 245.000 + 69.000 ✓
--
-- Van como HORAS EXTRAS de la semana (tarja_hs_extras), no repartidas en
-- días inventados: no sabemos qué días trabajó de más, y el concepto de
-- extras por semana existe justo para esto. La semana pasa de $686.000 a
-- $755.000, igual que la planilla.
--
-- created_by/updated_by quedan NULL: es un ajuste administrativo por
-- conciliación, no una carga de un usuario de tarja.

insert into tarja_hs_extras (obra_cod, leg, sem_key, hs)
values ('CC-016', '074', '2026-08-21', 14);
