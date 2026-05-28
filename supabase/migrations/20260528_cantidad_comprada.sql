-- Agrega `cantidad_comprada` a solicitud_compra_item para registrar la
-- cantidad realmente comprada cuando difiere de la solicitada (el encargado
-- de compras a veces compra de más, o lo que consiguió el proveedor).
--
-- `cantidad` sigue siendo la SOLICITADA (lo que pidió el jefe de obra).
-- `cantidad_comprada` es la REAL. NULL = se compró lo solicitado (datos
-- históricos y compras donde no se ajustó nada).
--
-- El MCC, el remito de envío y el stock usan COALESCE(cantidad_comprada,
-- cantidad) para tomar la real. La UI muestra ambas cuando difieren.

ALTER TABLE public.solicitud_compra_item
  ADD COLUMN cantidad_comprada NUMERIC;
