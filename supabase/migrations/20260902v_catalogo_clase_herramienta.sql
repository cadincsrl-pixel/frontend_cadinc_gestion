-- Curación del catálogo: marca como `clase='herramienta'` las herramientas de mano
-- que estaban colgadas en stock_materiales como si fueran material consumible.
--
-- Efecto: al elegir una de estas del catálogo en un pedido, la línea nace con el
-- toggle en "Herramienta" (herencia de `stock_materiales.clase`, migración 20260902u).
-- No cambia nada retroactivo: los items históricos siguen con su clase (default
-- 'material'), a propósito — no hay backfill heurístico.
--
-- Criterio: durable + reutilizable + va y vuelve de la obra. Se buscó por nombre y
-- se revisó a mano. Quedan FUERA a propósito:
--   * "Llave de paso ..." (x6): son válvulas de plomería, consumible de instalación.
--   * "Prensacable PG": accesorio eléctrico, consumible.
--   * "Balde de albañil" (12 y 20 lts): se pide y factura como consumible (28 pedidos,
--     con precio). Aunque sea reutilizable, el negocio lo trata como material.
--
-- 13 filas. Ninguna con movimientos de stock salvo "Regla de aluminio 3m" (1 mov,
-- stock -4: es uno de los 19 negativos ya anotados para el conteo físico).

update public.stock_materiales
   set clase = 'herramienta'
 where activo
   and id in (
     889,  -- Serrucho
     836,  -- Destornillador Phillips N°2 x 100mm
     830,  -- Llave francesa 10"
     848,  -- Llave grifa (stilson) 12"
     832,  -- Martillo carpintero c/ saca clavos
     816,  -- Maza de acero 3kg
     823,  -- Maza de goma
     839,  -- Pinza de fuerza 10"
     850,  -- Pinza pico de loro 10"
     814,  -- Tenaza
     336,  -- Regla de aluminio 2m
     337,  -- Regla de aluminio 3m
     339   -- Fratacho espuma
   );
