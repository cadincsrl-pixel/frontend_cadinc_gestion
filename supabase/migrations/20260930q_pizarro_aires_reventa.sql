-- Pizarro Refrigeración FA A 00012-00007486 (28/08/2026, $6.197.904): 6 splits York inverter
-- comprados para venderlos en un proyecto (dueño, 25/09). Va al centro de costo gerencial.
--
-- 1) Concepto nuevo «Mercadería para reventa»: equipos que se compran para venderlos, distinto de
--    «Materiales de obra» (consumo de las obras). Editable desde Compras › Facturas › «Conceptos».
-- 2) La factura (entró sin_imputar de Mis Comprobantes) queda imputada 100% a CC GERENCIA.
--    El PDF ya está adjunto (pagos_facturas_adjuntos 79). Sigue «pago a reconstruir»: no hay OP.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_conc bigint;
begin
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by)
  values ('Mercadería para reventa', 15, v_user, v_user) returning id into v_conc;

  perform public.pagos_imputar_lote(array[678]::bigint[], v_conc, 'CC GERENCIA', v_user);
end
$m$;
