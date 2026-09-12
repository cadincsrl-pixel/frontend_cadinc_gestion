-- Qué se transportó en cada tramo
--
-- Pedido de Alina (11/09, vía el user): al cargar un tramo poder decir qué
-- lleva —maíz, soja, trigo, harina de soja, azúcar, arena— para que aparezca
-- en el detalle de facturación. El problema concreto: "el cliente nos dice
-- 'ya te pagaron la harina de soja' y no sabemos cuál es". Hoy un viaje se
-- identifica por remito, fechas y toneladas; nada dice qué llevaba.
--
-- Texto y no tabla aparte, a propósito: la lista es corta y estable (una
-- decena de productos), el campo `obs` de los 456 tramos no tiene ni una
-- mención de producto —o sea que no hay nada que migrar— y el combo de la
-- pantalla ofrece siempre lo ya cargado, que es lo que evita que se
-- desparrame. Mismo patrón que `tarifa_variante`. Si algún día hace falta
-- filtrar en serio por producto, pasarlo a tabla es un `update ... from`.
--
-- Solo tiene sentido en los tramos cargados: un tramo vacío no lleva nada.

alter table public.tramos
  add column if not exists producto text;

comment on column public.tramos.producto is
  'Qué se transportó (maíz, soja, harina de soja, arena...). Solo en tramos cargados. Se muestra en Viajes y en el detalle de facturación para que el cliente y CADINC hablen del mismo viaje.';
