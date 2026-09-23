-- =====================================================================
-- Las fechas de emisión de 5 facturas, corregidas al papel (2026-09-23)
--
-- Pedido del dueño: «corrijamos fecha de emisión». Las 13 facturas cargadas
-- tenían como fecha de emisión el día de carga: el modal propone hoy y nadie
-- la cambiaba. El control nuevo (20260923a) leyó la fecha de cada comprobante
-- y marcó cinco; las cinco se miraron además en la foto:
--
--   id  proveedor           cargada   papel     cómo se verificó
--   ──  ──────────────────  ────────  ────────  ──────────────────────────────
--   11  Cencosud (puertas)  21/09     18/09     a mano el 21/09 + control
--   12  Cencosud (tender)   21/09     18/09     a mano el 21/09 + control
--   13  Aceros del NOA      21/09     18/09     a mano el 21/09 + control
--   17  Todolandia          22/09     21/09     foto + control
--   18  Martin Escapes      23/09     22/09     foto + control
--
-- Las otras 7 con comprobante coinciden. La 21 (Santa Clara, 20 ladrillos
-- refractarios) no tiene foto subida: no se pudo controlar.
--
-- ESCAPE `cadinc.descongelar`: las cinco están `pagada`, y la fecha está en
-- lo congelado (fn_pagos_factura_congelada → FACTURA_CON_PAGOS). Motivo: la
-- fecha es un dato del papel mal tipeado, no plata; ningún importe, obra ni
-- orden de pago cambia. Todas quedan en septiembre, así que tampoco cambia el
-- mes de emisión ni el período de IVA.
--
-- El vencimiento se corre lo mismo que la fecha, para que conserve el plazo
-- con que se cargó (30 días). La 18 no tiene vencimiento.
--
-- Después se re-compara el control: la fila nueva (`modelo = 'recomparado'`)
-- apaga el chip rojo de la bandeja, y queda el rastro de cuándo se corrigió.
-- =====================================================================

do $$
declare n integer;
begin
  set local cadinc.descongelar = 'on';

  -- El `and f.fecha = …` hace que la migración sólo toque lo que encontró mal:
  -- si alguien ya lo corrigió, no pisa nada.
  update pagos_facturas f
     set fecha = v.fecha, vence_el = f.vence_el + (v.fecha - f.fecha)
    from (values (11, date '2026-09-18', date '2026-09-21'),
                 (12, date '2026-09-18', date '2026-09-21'),
                 (13, date '2026-09-18', date '2026-09-21'),
                 (17, date '2026-09-21', date '2026-09-22'),
                 (18, date '2026-09-22', date '2026-09-23')) v(id, fecha, cargada)
   where f.id = v.id and f.fecha = v.cargada;
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'ESPERABA_5_FACTURAS: %', n; end if;

  insert into pagos_facturas_control
    (factura_id, adjunto_id, estado, numero_leido, total_leido, numero_ok, total_ok, fecha_leida, fecha_ok, nota, modelo)
  select c.factura_id, c.adjunto_id, 'coincide', c.numero_leido, c.total_leido, c.numero_ok, c.total_ok,
         c.fecha_leida, true, '', 'recomparado'
    from pagos_facturas f
    join lateral (select * from pagos_facturas_control c
                   where c.factura_id = f.id order by created_at desc limit 1) c on true
   where f.id in (11, 12, 13, 17, 18)
     and c.fecha_leida = f.fecha and c.numero_ok and c.total_ok;
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'ESPERABA_5_CONTROLES: %', n; end if;
end $$;
