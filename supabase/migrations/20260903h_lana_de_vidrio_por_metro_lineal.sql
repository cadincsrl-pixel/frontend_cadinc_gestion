-- =====================================================================
-- La lana de vidrio se compra por METRO LINEAL de rollo, no por m2
--
-- Correccion del user (2026-09-03), sobre la fila que la migracion
-- 20260903f habia elegido para el alias "manto de aislacion".
--
-- Viene en rollo de 1.20m de ancho y se compra por metro de rollo, asi que
-- la fila pasa de unidad 'm2' a 'm' y el ancho entra en el nombre — sin el
-- ancho, un "15" no se puede convertir a superficie y la fila no sirve para
-- computar. Los alias (manto de aislacion, manto aislante, etc.) quedan
-- donde estaban.
--
-- Seguro de aplicar: la fila 83 estaba en cero, sin precio de referencia,
-- sin movimientos de stock y con un unico item apuntandole (el pedido #650
-- de Farmacia America, que se corrige en la misma tanda).
--
-- NO se tocan las otras dos filas de la familia, por decision del user
-- (quedan para una limpieza aparte):
--   · 84  'Lana de vidrio 100mm'      — sigue por m2, mismo problema
--   · 463 'Lana de vidrio rollo 50mm' — por rollo, duplicada con esta
-- Tampoco existe todavia la variante CON ALUMINIO, que es la unica que
-- realmente se compro (Clinica Salta, 26/08: 28 m2 a $5.200).
-- =====================================================================

update public.stock_materiales
set nombre = 'Lana de vidrio 50mm (rollo 1.20m)',
    unidad = 'm',
    alias  = (select array_agg(distinct a order by a)
              from unnest(coalesce(alias,'{}') || array['lana de vidrio 50mm']) a),
    obs    = 'Se compra por metro lineal de rollo. Rollo de 1.20m de ancho: 1 m lineal = 1.20 m2.'
where id = 83;
