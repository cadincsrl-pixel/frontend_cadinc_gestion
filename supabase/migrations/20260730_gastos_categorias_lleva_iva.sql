-- Marca por categoría: ¿el monto cargado lleva IVA adentro (neteable /1,21)
-- o es final sin IVA recuperable?
--
-- Para el modo "Neto de IVA" de Gastos > Reportes (pedido del dueño
-- 2026-07-30): la facturación se netea exacta (las tarifas se guardan
-- neta × 1,21), pero los gastos guardan UN solo monto —el total pagado— y el
-- sistema no sabe si el comprobante fue factura A o monotributista. La marca
-- por categoría es la aproximación práctica: cubre el 95% de la plata porque
-- el combustible ($154M de $182M) siempre lleva IVA.
--
-- Confirmado por el dueño: gomería y lavadero son monotributistas → final.
-- Patente y multas son tributos (sin IVA); viáticos van sin factura.

alter table public.gastos_categorias
  add column if not exists lleva_iva boolean not null default true;

comment on column public.gastos_categorias.lleva_iva is
  'true = el monto cargado incluye IVA 21% (neteable). false = final sin IVA recuperable (monotributista, tributo o sin factura). Usado por el modo Neto de Gastos > Reportes.';

update public.gastos_categorias
   set lleva_iva = false
 where codigo in ('gomeria', 'lavadero', 'patente', 'multa', 'viatico');
