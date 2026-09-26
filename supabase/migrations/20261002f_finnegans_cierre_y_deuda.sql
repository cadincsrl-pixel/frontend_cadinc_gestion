-- Cierre de la reconstrucción con el reporte de pagos de Finnegans (26/09). Criterio del dueño: lo que tiene
-- respaldo (banco, tarjeta, Mercado Pago, caja) queda pagado aunque Finnegans diga otra cosa; Finnegans ordena a qué
-- factura va cada pago y marca la deuda real.
-- 1) Pagos con respaldo: Vancar e-cheq 2828; HDI caja 01/09; Petenati tarjeta 15/08 ($1,70M, sobrante a cuenta);
--    Tecnotec endoso 3098 de Adrenalina Rent ($4,30M → FA 2275, sobrante a cuenta: deuda anterior a julio);
--    Zeramiko e-cheq 3016 (según Finnegans).
-- 2) Pasan a DEUDA (dejan de estar «a reconstruir») las facturas que Finnegans tiene cargadas y sin pagar y para las
--    que no hay ningún pago en bancos, tarjeta, Mercado Pago ni caja: 69 facturas.
--    Quedan «a reconstruir» los débitos (bancos, peajes, Mercado Libre, caución), ARGEC y Transporte Global.
do $m$
declare
  u  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  d  jsonb := '[{"prov": 78, "fecha": "2026-07-16", "forma": "echeq", "cuenta": 1, "monto": 211787.44, "ref": "Galicia CC 4736: e-cheq 2828 («Orden de pago / Vancar cuenta corriente»); Finnegans lo aplica a FA 13576 (junio), 13674, 13693, 13716 y 13718", "cheques": [{"numero": "2828", "banco": "Galicia", "fecha_cobro": "2026-07-17", "monto": 211787.44, "es_propio": true, "librador": ""}], "lineas": [{"tipo": "factura", "factura_id": 136, "monto": 22638.62}, {"tipo": "factura", "factura_id": 154, "monto": 54956.98}, {"tipo": "factura", "factura_id": 161, "monto": 42602.48}, {"tipo": "factura", "factura_id": 638, "monto": 67.76}, {"tipo": "a_cuenta", "monto": 91521.6}]}, {"prov": 99, "fecha": "2026-09-01", "forma": "efectivo", "cuenta": 3, "monto": 342000.02, "ref": "Caja (Finnegans: pago en efectivo del 01/09 por $530.000,02 a HDI; el resto ya estaba en la FA 3263)", "lineas": [{"tipo": "factura", "factura_id": 697, "monto": 171000.01}, {"tipo": "factura", "factura_id": 698, "monto": 171000.01}]}, {"prov": 196, "fecha": "2026-08-15", "forma": "tarjeta", "cuenta": 20, "monto": 1702668.19, "ref": "Visa Business Galicia · resumen 20/08 · consumo 15/08 MERPAGO*PETENATTIHOGA · tarjeta 9615 (el sobrante es de compras de Petenati sin factura en el ERP)", "lineas": [{"tipo": "factura", "factura_id": 550, "monto": 290999.0}, {"tipo": "factura", "factura_id": 551, "monto": 290999.0}, {"tipo": "factura", "factura_id": 552, "monto": 290999.0}, {"tipo": "a_cuenta", "monto": 829671.19}]}, {"prov": 67, "fecha": "2026-07-06", "forma": "echeq", "cuenta": 1, "monto": 4296463.06, "ref": "Galicia CC 4736: e-cheq 3098 de ADRENALINA RENT SA endosado a Tecnotec («Varios / op3776»); Finnegans da la FA 2275 por pagada", "cheques": [{"numero": "3098", "banco": "BANCO DE GALICIA Y BUENOS AIRES S.A.U.", "fecha_cobro": "2026-07-06", "monto": 4296463.06, "es_propio": false, "librador": "ADRENALINA RENT SA · CUIT 30711040176"}], "lineas": [{"tipo": "factura", "factura_id": 116, "monto": 3129835.92}, {"tipo": "a_cuenta", "monto": 1166627.14}]}, {"prov": 22, "fecha": "2026-09-04", "forma": "echeq", "cuenta": 1, "monto": 415769.42, "ref": "Finnegans: e-cheq Galicia 3016 del 04/09 a Olaz María Rosa (Zeramiko) por $415.769,42", "cheques": [{"numero": "3016", "banco": "Galicia", "fecha_cobro": "2026-09-04", "monto": 415769.42, "es_propio": true, "librador": ""}], "lineas": [{"tipo": "factura", "factura_id": 766, "monto": 415769.42}]}]'::jsonb;
  e  jsonb;
  f  bigint;
begin
  for e in select * from jsonb_array_elements(d) loop
    perform public.pagos_reconstruir_orden((e->>'prov')::bigint,
      jsonb_build_object('fecha', e->>'fecha', 'forma_pago', e->>'forma', 'monto_pagado', (e->>'monto')::numeric,
        'cuenta_origen_id', (e->>'cuenta')::bigint, 'referencia', e->>'ref',
        'obs', 'Pago reconstruido el 26/09 con el reporte de pagos de Finnegans')
        || case when e ? 'cheques' then jsonb_build_object('cheques', e->'cheques') else '{}'::jsonb end,
      e->'lineas', u);
  end loop;
  foreach f in array array[164,181,778,124,757,758,224,89,254,267,815,112,129,152,210,289,288,309,859,391,412,415,903,441,913,919,918,442,443,926,463,843,467,464,792,465,494,496,518,524,520,525,526,543,548,549,545,544,568,576,584,595,596,606,605,607,612,627,651,650,655,659,658,663,672,681,680,687,686]::bigint[] loop
    if (select pago_a_reconstruir and saldo > 0 from public.v_pagos_facturas where id = f) then
      perform public.pagos_pasar_a_deuda(f, u);
    end if;
  end loop;
end $m$;
