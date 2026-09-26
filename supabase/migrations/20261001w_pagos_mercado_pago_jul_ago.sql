-- Pagos por Mercado Pago (extractos jun–ago 2026) cruzados con compras «a reconstruir».
-- Transferencias enviadas desde la cuenta de CADINC en Mercado Pago que cruzan con UNA factura impaga por
-- proveedor, fecha e importe. Una OP por factura, forma «transferencia», cuenta de origen «Mercado Pago»
-- (tesorería 18). Si la transferencia supera el saldo en más de 2 centavos, el sobrante queda «a cuenta»
-- del proveedor (Plasticaucho $124,45, Bulonería Belgrano $43,30, Pinturería España $49,71, Delgado $139,29).
-- Fuente: ~/Desktop/CADINC-documentos/Banco/Mercado Pago/.
do $m$
declare
  u  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  d  jsonb := '[{"f": 102, "fecha": "2026-07-02", "monto": 18141.72, "linea": 18141.72, "exceso": 0.0, "ref": "Mercado Pago · 02/07 Transferencia enviada Casa Schanton Sa · op. 165970217929", "dif": 0.0}, {"f": 203, "fecha": "2026-07-17", "monto": 500000.0, "linea": 500000.0, "exceso": 0.0, "ref": "Mercado Pago · 17/07 Transferencia enviada Planta De Verif Autopista Srl · op. 168370272827", "dif": 0.0}, {"f": 211, "fecha": "2026-07-20", "monto": 680000.0, "linea": 680000.0, "exceso": 0.0, "ref": "Mercado Pago · 20/07 Transferencia enviada Romero Julio Leonardo · op. 169736313910", "dif": 0.0}, {"f": 264, "fecha": "2026-07-27", "monto": 14999.99, "linea": 14999.99, "exceso": 0.0, "ref": "Mercado Pago · 27/07 Transferencia enviada Unzaga Diana · op. 170756604766", "dif": 0.01}, {"f": 477, "fecha": "2026-08-11", "monto": 3500.02, "linea": 3500.02, "exceso": 0.0, "ref": "Mercado Pago · 11/08 Transferencia enviada Transporte Martinez Sas · op. 172292292877", "dif": -0.02}, {"f": 480, "fecha": "2026-08-11", "monto": 81995.0, "linea": 81995.0, "exceso": 0.0, "ref": "Mercado Pago · 11/08 Transferencia enviada Nuevo Santiago Aberturas Srl · op. 173241349634", "dif": 0.0}, {"f": 555, "fecha": "2026-08-18", "monto": 169200.0, "linea": 169200.0, "exceso": 0.0, "ref": "Mercado Pago · 18/08 Transferencia enviada Solana Maria Gil Romero · op. 173531691447", "dif": 0.0}, {"f": 580, "fecha": "2026-08-20", "monto": 154750.0, "linea": 154750.0, "exceso": 0.0, "ref": "Mercado Pago · 20/08 Transferencia enviada Sedest Soc Anonima · op. 173824306169", "dif": 0.0}, {"f": 654, "fecha": "2026-08-27", "monto": 199871.65, "linea": 199871.65, "exceso": 0.0, "ref": "Mercado Pago · 27/08 Transferencia enviada Rolcar Sa · op. 175858550958", "dif": 0.0}, {"f": 218, "fecha": "2026-07-20", "monto": 162409.0, "linea": 162284.55, "exceso": 124.45, "ref": "Mercado Pago · 20/07 Transferencia enviada Plasticaucho Sa · op. 168857304253", "dif": 124.45}, {"f": 433, "fecha": "2026-08-07", "monto": 26000.0, "linea": 25999.88, "exceso": 0.12, "ref": "Mercado Pago · 07/08 Transferencia enviada Transporte Martinez Sas · op. 172526165006", "dif": 0.12}, {"f": 434, "fecha": "2026-08-07", "monto": 15000.0, "linea": 14999.89, "exceso": 0.11, "ref": "Mercado Pago · 07/08 Transferencia enviada Transporte Martinez Sas · op. 172526345076", "dif": 0.11}, {"f": 435, "fecha": "2026-08-07", "monto": 12000.01, "linea": 12000.01, "exceso": 0.0, "ref": "Mercado Pago · 07/08 Transferencia enviada Transporte Martinez Sas · op. 172545374266", "dif": -0.01}, {"f": 307, "fecha": "2026-07-28", "monto": 7187.87, "linea": 7144.57, "exceso": 43.3, "ref": "Mercado Pago · 28/07 Transferencia enviada Bulonería Belgrano · op. 170913895414", "dif": 43.3}, {"f": 466, "fecha": "2026-08-10", "monto": 8425.25, "linea": 8375.54, "exceso": 49.71, "ref": "Mercado Pago · 10/08 Transferencia enviada Pintureria España · op. 172114576759", "dif": 49.71}, {"f": 646, "fecha": "2026-08-26", "monto": 23641.0, "linea": 23501.71, "exceso": 139.29, "ref": "Mercado Pago · 26/08 Transferencia enviada Marta Josefina Delgado · op. 174790472419", "dif": 139.29}]'::jsonb;
  e  jsonb;
  v_prov bigint;
  v_lin  jsonb;
begin
  for e in select * from jsonb_array_elements(d) loop
    select proveedor_id into v_prov from public.pagos_facturas where id = (e->>'f')::bigint;
    v_lin := jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',(e->>'f')::bigint,'monto',(e->>'linea')::numeric));
    if (e->>'exceso')::numeric > 0 then
      v_lin := v_lin || jsonb_build_object('tipo','a_cuenta','monto',(e->>'exceso')::numeric);
    end if;
    perform public.pagos_reconstruir_orden(v_prov,
      jsonb_build_object('fecha', e->>'fecha', 'forma_pago', 'transferencia', 'monto_pagado', (e->>'monto')::numeric,
        'cuenta_origen_id', 18, 'referencia', e->>'ref',
        'obs', 'Pago reconstruido el 25/09 con los extractos de Mercado Pago'),
      v_lin, u);
  end loop;
end $m$;
