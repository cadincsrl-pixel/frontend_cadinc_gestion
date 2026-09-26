-- Silva SRL: se rehace la imputación de la tanda 2 (20261001x) según el reporte de pagos de Finnegans.
-- Los MISMOS cheques (respaldo del banco), aplicados a las facturas que dice Finnegans:
--   · 5 cheques del 26/08 (2976 + endosos Casilda 14321907, 14380062, 14321866, 14321867 = $1.343.310)
--     → FA 25791 ($1.263.192,66) y el resto a la FA 25106.
--   · e-cheq 2988 del 31/08 ($1.582.854,84) → FA 25106 (resto), 25194, 25212, 25299, 25233 (Finnegans);
--     el sobrante es plata que salió del banco y cancela las más viejas pendientes (25390 y parte de 25416).
-- Las facturas de agosto que Finnegans no aplicó vuelven a quedar pendientes (deuda). OP 578 (2903) queda igual.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  o bigint;
begin
  foreach o in array array[592,593,594,595,596,600]::bigint[] loop
    perform public.pagos_anular_orden(o, 'Se rehace según el reporte de pagos de Finnegans (26/09): los mismos cheques pagan otras facturas', u);
  end loop;

  perform public.pagos_reconstruir_orden(30,
    jsonb_build_object('fecha','2026-08-26','forma_pago','echeq','monto_pagado',1343310.00,'cuenta_origen_id',1,
      'referencia','Galicia/cartera: e-cheq 2976 + endosos Casilda 14321907, 14380062, 14321866, 14321867 (Finnegans: aplicados a FA 25791)',
      'obs','Pago reconstruido el 26/09 según Finnegans (Silva rehecho)',
      'cheques','[{"numero": "2976", "banco": "Galicia", "fecha_cobro": "2026-09-26", "monto": 190310.0, "es_propio": true, "librador": ""}, {"numero": "14321907", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-17", "monto": 315000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14380062", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-23", "monto": 270000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14321866", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-17", "monto": 284000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}, {"numero": "14321867", "banco": "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", "fecha_cobro": "2026-09-18", "monto": 284000.0, "es_propio": false, "librador": "CASILDA COMBUSTIBLES SRL · CUIT 30715675265"}]'::jsonb),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',649,'monto',1263192.66),
                      jsonb_build_object('tipo','factura','factura_id',208,'monto',80117.34)), u);

  perform public.pagos_reconstruir_orden(30,
    jsonb_build_object('fecha','2026-08-31','forma_pago','echeq','monto_pagado',1582854.84,'cuenta_origen_id',1,
      'referencia','Galicia CC 4736: e-cheq 2988 («Orden de pago / Silva cuenta corriente»); Finnegans lo aplica a FA 25106/25194/25212/25299/25233',
      'obs','Pago reconstruido el 26/09 según Finnegans (Silva rehecho); el sobrante cancela las más viejas pendientes',
      'cheques', jsonb_build_array(jsonb_build_object('numero','2988','banco','Galicia','fecha_cobro','2026-09-01','monto',1582854.84,'es_propio',true,'librador',''))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',208,'monto',89322.24),
                      jsonb_build_object('tipo','factura','factura_id',249,'monto',627206.72),
                      jsonb_build_object('tipo','factura','factura_id',252,'monto',11192.58),
                      jsonb_build_object('tipo','factura','factura_id',253,'monto',17836.24),
                      jsonb_build_object('tipo','factura','factura_id',276,'monto',347089.09),
                      jsonb_build_object('tipo','factura','factura_id',399,'monto',475171.59),
                      jsonb_build_object('tipo','factura','factura_id',415,'monto',15036.38)), u);
end $m$;
