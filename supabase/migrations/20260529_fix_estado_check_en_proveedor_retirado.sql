-- El CHECK de solicitud_compra_item.estado solo permitía
--   pendiente, comprado, de_deposito, enviado, rechazado
-- pero la feature "stock en proveedor" (§5.8) usa dos estados más:
--   en_proveedor (compra que queda en el galpón del proveedor)
--   retirado     (retirado del proveedor con remito, listo para enviar)
--
-- Las RPCs resolver_item_en_proveedor / retirar_de_proveedor intentan setear
-- esos estados, pero el CHECK los bloqueaba a nivel DB → la feature nunca
-- pudo completarse (0 filas en esos estados, histórico). Junto con la
-- regresión de permisos secdef (migración 20260527, arreglada el 2026-05-29),
-- eran dos bugs independientes tapando el mismo flujo.
--
-- Widening del constraint: agregar valores al ANY() nunca viola filas
-- existentes, así que es seguro sin backfill.

ALTER TABLE public.solicitud_compra_item
  DROP CONSTRAINT solicitud_compra_item_estado_check;

ALTER TABLE public.solicitud_compra_item
  ADD CONSTRAINT solicitud_compra_item_estado_check
  CHECK (estado = ANY (ARRAY[
    'pendiente'::text,
    'comprado'::text,
    'de_deposito'::text,
    'en_proveedor'::text,
    'retirado'::text,
    'enviado'::text,
    'rechazado'::text
  ]));
