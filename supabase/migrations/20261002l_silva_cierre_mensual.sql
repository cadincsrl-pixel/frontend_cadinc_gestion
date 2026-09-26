-- Silva SRL cierra la cuenta corriente UNA VEZ POR MES y se paga con un cheque (dueño, 26/09).
-- El e-cheq 2988 del 31/08 ($1.582.854,84, «Silva cuenta corriente») es EXACTAMENTE la suma de las facturas de julio
-- (menos la 25295, pagada aparte con el 2885): 171, 183, 196, 208, 249, 252, 253, 276 = $1.582.854,83.
-- El e-cheq 2903 del 31/07 ($410.090,62, «cuenta corriente») es el cierre de JUNIO: facturas anteriores al ERP. No se
-- carga como OP (la RPC exige al menos una factura): va a la apertura contable / saldo inicial de Silva.
-- Los 5 cheques del 26/08 van a la FA 25791 (como dice Finnegans); el resto ($80.117,34) a cuenta.
-- Agosto (cierre ≈ $3,48M) y septiembre todavía no tienen cheque: son deuda real.
-- Reemplaza las OP 578, 1060 y 1061 (20261001x / 20261002e).
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  o bigint;
  f bigint;
begin
  foreach o in array array[578,1060,1061]::bigint[] loop
    perform public.pagos_anular_orden(o, 'Silva cierra la cuenta una vez por mes: se rehace con el cheque de cada cierre (dueño, 26/09)', u);
  end loop;

  perform public.pagos_reconstruir_orden(30,
    jsonb_build_object('fecha','2026-08-26','forma_pago','echeq','monto_pagado',1343310.00,'cuenta_origen_id',1,
      'referencia','Galicia/cartera: e-cheq 2976 + endosos Casilda 14321907, 14380062, 14321866, 14321867 (FA 25791)',
      'obs','Pago reconstruido el 26/09: Silva, FA 25791 (Finnegans); el resto a cuenta',
      'cheques','[{"numero": "2976", "banco": "Galicia", "fecha_cobro": "2026-09-26", "monto": 190310.0, "es_propio": true, "librador": ""}, {"numero": "14321907", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-17", "monto": 315000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14380062", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-23", "monto": 270000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14321866", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-17", "monto": 284000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14321867", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-18", "monto": 284000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}]'::jsonb),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',649,'monto',1263192.66),
                      jsonb_build_object('tipo','a_cuenta','monto',80117.34)), u);

  perform public.pagos_reconstruir_orden(30,
    jsonb_build_object('fecha','2026-08-31','forma_pago','echeq','monto_pagado',1582854.84,'cuenta_origen_id',1,
      'referencia','Galicia CC 4736: e-cheq 2988 («Orden de pago / Silva cuenta corriente»): cierre de julio',
      'obs','Pago reconstruido el 26/09: cierre mensual de Silva (julio), suma exacta de las facturas del mes',
      'cheques', jsonb_build_array(jsonb_build_object('numero','2988','banco','Galicia','fecha_cobro','2026-09-01','monto',1582854.84,'es_propio',true,'librador',''))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',171,'monto',22728.10),
                      jsonb_build_object('tipo','factura','factura_id',183,'monto',136850.24),
                      jsonb_build_object('tipo','factura','factura_id',196,'monto',52390.53),
                      jsonb_build_object('tipo','factura','factura_id',208,'monto',367561.33),
                      jsonb_build_object('tipo','factura','factura_id',249,'monto',627206.72),
                      jsonb_build_object('tipo','factura','factura_id',252,'monto',11192.58),
                      jsonb_build_object('tipo','factura','factura_id',253,'monto',17836.24),
                      jsonb_build_object('tipo','factura','factura_id',276,'monto',347089.09),
                      jsonb_build_object('tipo','a_cuenta','monto',0.01)), u);

  -- Agosto y septiembre sin cheque de cierre todavía: deuda real.
  for f in select v.id from public.v_pagos_facturas v where v.proveedor_id = 30 and v.pago_a_reconstruir and v.saldo > 0.05
             and v.fecha between '2026-08-01' and '2026-09-30' and v.clase = 'factura' loop
    perform public.pagos_pasar_a_deuda(f, u);
  end loop;
end $m$;
