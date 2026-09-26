-- Pagos en efectivo desde la Caja (planilla «CAJA CADINC GENERAL», hoja Caja 2026) contra compras «a reconstruir».
-- 10 renglones de caja cuyo texto y fecha identifican la factura (Via Cargo / Via Bariloche, HDI service Amarok,
-- Trivisonno pasaje, Contreras caños, Ruiz Díaz arreglo máquinas, Nivo placa superboard, Carnicer bidones, Giobellina).
-- La caja redondea: se paga el saldo exacto de la factura y el importe de caja queda en la referencia.
-- Forma «efectivo», tesorería 3 (Caja). Fuente: ~/Desktop/CADINC-documentos/Banco/Caja CADINC general.xlsx
do $m$
declare
  u  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  d  jsonb := '[{"prov": 35, "fecha": "2026-07-06", "monto": 94000.0, "lineas": [{"tipo": "factura", "factura_id": 119, "monto": 94000.0}], "ref": "Caja CADINC 06/07: $94,000 «envío via cargo»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 35, "fecha": "2026-09-15", "monto": 147000.01, "lineas": [{"tipo": "factura", "factura_id": 893, "monto": 147000.01}], "ref": "Caja CADINC 15/09: $147,000 «Via Cargo retiro»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 55, "fecha": "2026-09-01", "monto": 371000.0, "lineas": [{"tipo": "factura", "factura_id": 743, "monto": 371000.0}], "ref": "Caja CADINC 01/09: $371,000 «retiro via cargo»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 99, "fecha": "2026-07-20", "monto": 188000.0, "lineas": [{"tipo": "factura", "factura_id": 212, "monto": 188000.0}], "ref": "Caja CADINC 20/07: $188,000 «service amarok»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 61, "fecha": "2026-07-10", "monto": 139997.99, "lineas": [{"tipo": "factura", "factura_id": 110, "monto": 139997.99}], "ref": "Caja CADINC 10/07: $140,000 «pasaje quilmes»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 88, "fecha": "2026-07-14", "monto": 46462.87, "lineas": [{"tipo": "factura", "factura_id": 165, "monto": 46462.87}], "ref": "Caja CADINC 14/07: $46,463 «caños casa de la misión»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 259, "fecha": "2026-09-04", "monto": 69999.0, "lineas": [{"tipo": "factura", "factura_id": 808, "monto": 69999.0}], "ref": "Caja CADINC 04/09: $70,000 «arreglo maquinas»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 252, "fecha": "2026-09-09", "monto": 38723.5, "lineas": [{"tipo": "factura", "factura_id": 773, "monto": 38723.5}], "ref": "Caja CADINC 09/09: $38,923 «placa superboard»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 63, "fecha": "2026-08-08", "monto": 60000.0, "lineas": [{"tipo": "factura", "factura_id": 454, "monto": 60000.0}], "ref": "Caja CADINC 08/08: $60,000 «bidones de agua»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}, {"prov": 280, "fecha": "2026-09-15", "monto": 300000.0, "lineas": [{"tipo": "factura", "factura_id": 897, "monto": 300000.0}], "ref": "Caja CADINC 15/09: $300,000 «strada mantenimiento»", "obs": "Pago reconstruido el 26/09 con la planilla de caja"}]'::jsonb;
  e  jsonb;
begin
  for e in select * from jsonb_array_elements(d) loop
    perform public.pagos_reconstruir_orden((e->>'prov')::bigint,
      jsonb_build_object('fecha', e->>'fecha', 'forma_pago', 'efectivo', 'monto_pagado', (e->>'monto')::numeric,
        'cuenta_origen_id', 3, 'referencia', e->>'ref', 'obs', e->>'obs'),
      e->'lineas', u);
  end loop;
end $m$;
