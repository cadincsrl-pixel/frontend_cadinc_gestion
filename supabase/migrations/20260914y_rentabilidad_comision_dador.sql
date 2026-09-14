-- Simulador de rentabilidad: la comisión del dador de carga
--
-- Pedido del user (14/09): "a veces la tarifa que nos brindan incluye un
-- porcentaje de comisión del dador de carga". Hoy hay que hacer esa cuenta a
-- mano antes de tipear la tarifa, y es fácil olvidarse: el simulador toma el
-- número tal cual y sobreestima el margen.
--
-- Es el mismo concepto que la contra factura de intermediarios del flujo real
-- (20260902), pero ahí el dato se guarda como MONTO por viaje porque llega un
-- comprobante. Acá es una simulación y no hay comprobante, así que va el
-- porcentaje. Queda como campo del viaje simulado, no de la empresa: el
-- simulador no tiene FK al modelo operativo y así sigue.
--
-- OJO con el efecto sobre el chofer, que es la parte no obvia. En la realidad
-- el chofer al % cobra sobre lo que queda DESPUÉS de la comisión:
--   liquidacion-math.ts: neto = (ton * tarifa - comision) / 1,21
-- El simulador le pagaba sobre el bruto entero, así que para un viaje con
-- comisión sobreestimaba las dos puntas: el ingreso y el pago al chofer.
-- Con este campo las dos bajan, igual que en la liquidación real.
--
-- Default 0 = sin comisión: los 28 viajes ya cargados no cambian de resultado.

alter table rentabilidad_viajes
  add column comision_pct numeric not null default 0;

alter table rentabilidad_viajes
  add constraint rentabilidad_viajes_comision_pct_check
  check (comision_pct >= 0 and comision_pct < 100);

comment on column rentabilidad_viajes.comision_pct is
  'Comisión del dador de carga, en % sobre la tarifa (8 = 8%). La tarifa que pasa el dador ya la incluye, así que se descuenta para obtener lo que realmente entra. Afecta también al pago del chofer al %, igual que la contra factura en la liquidación real.';
