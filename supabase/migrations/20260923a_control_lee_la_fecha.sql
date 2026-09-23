-- =====================================================================
-- El control del comprobante también lee la fecha de emisión (2026-09-23)
--
-- Pedido del dueño: «que el sistema nos dé una alerta cuando las fechas de
-- emisión estén mal».
--
-- Por qué ahora. Al 23/09 las 13 facturas cargadas tienen como fecha de
-- emisión EXACTAMENTE el día en que se cargaron: el modal propone hoy y nadie
-- lo cambia. Las 11, 12 y 13 dicen 18/09 en el papel y están cargadas 21/09.
-- La fecha mueve el vencimiento y el período de IVA, y una vez pagada la
-- factura queda congelada (FACTURA_CON_PAGOS): si el error no se ve al cargar,
-- después corregirlo exige una migración.
--
-- Mismo criterio que número y total (20260921j): AVISA, NO BLOQUEA. Si el
-- papel dice otra fecha, el control queda `difiere` con la nota, y se ve en
-- la bandeja con el chip rojo que ya existe.
-- =====================================================================

alter table public.pagos_facturas_control
  add column if not exists fecha_leida date,
  add column if not exists fecha_ok    boolean;

comment on column public.pagos_facturas_control.fecha_leida is
  'Fecha de emisión leída del comprobante. NULL = no se pudo leer.';
comment on column public.pagos_facturas_control.fecha_ok is
  'La fecha leída coincide con pagos_facturas.fecha. NULL = no se comparó.';

comment on table public.pagos_facturas_control is
  'Control automático del comprobante contra lo tipeado: número, total y fecha de emisión (20260921j, 20260923a). Avisa, no bloquea.';
