-- =====================================================================
-- Retenciones en los adjuntos del cobro
--
-- Pedido del dueño (2026-09-03): al registrar el cobro de una factura, la
-- empresa suele pagar menos el importe retenido (IVA, Ganancias, IIBB) y
-- manda los certificados de retención junto con el comprobante de la
-- transferencia. Hasta ahora esos PDFs no tenían dónde ir.
--
-- Decisiones:
--   · Nuevo tipo de adjunto 'retencion' — NO es un tipo nuevo de documento
--     principal: es opcional y no interviene en la validación de
--     FALTA_COMPROBANTE_PAGO (que sigue exigiendo tipo='comprobante').
--   · Son VARIOS certificados por pago (uno por impuesto/jurisdicción), por
--     eso el slot admite multi-selección — la tabla ya soporta N filas por
--     (cobro_id, tipo); el único límite es el unique de hash por cobro.
--   · Aplica a las dos modalidades de cobro (facturación y líquido
--     producto): en ambas el que paga es quien retiene.
-- =====================================================================

alter table public.cobros_adjuntos
  drop constraint if exists cobros_adjuntos_tipo_check;
alter table public.cobros_adjuntos
  add constraint cobros_adjuntos_tipo_check
  check (tipo in ('liquidacion', 'comprobante', 'factura', 'contra_factura', 'retencion'));
