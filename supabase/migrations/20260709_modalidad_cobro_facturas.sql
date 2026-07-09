-- Modalidad de cobro por empresa transportista + datos de factura emitida.
-- Dos formas de cobrar a las empresas:
--   'liquido_producto' — la empresa emite la liquidación y CADINC marca qué
--                        remitos le pagaron (flujo original de cobros).
--   'facturacion'      — CADINC emite una factura por CADA viaje; el cobro
--                        registra nº y fecha de esa factura y el tramo queda
--                        marcado como facturado vía tramos.cobro_id.

alter table empresas_transportistas
  add column modalidad_cobro varchar not null default 'liquido_producto'
  check (modalidad_cobro in ('liquido_producto', 'facturacion'));

-- Datos de la factura emitida (solo se cargan en cobros de empresas 'facturacion').
alter table cobros add column factura_nro varchar;
alter table cobros add column factura_fecha date;

-- Nuevo tipo de adjunto: la factura emitida (PDF/foto).
alter table cobros_adjuntos drop constraint cobros_adjuntos_tipo_check;
alter table cobros_adjuntos add constraint cobros_adjuntos_tipo_check
  check (tipo in ('liquidacion', 'comprobante', 'factura'));

-- Backfill: empresas que trabajan con factura por viaje (confirmado 2026-07-09).
update empresas_transportistas
  set modalidad_cobro = 'facturacion'
  where nombre in ('GABAS HUGO', 'LOGISTICA GLOBAL', 'Paramerica SA');
