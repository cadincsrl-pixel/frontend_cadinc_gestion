-- Hierronort FA A 0043-00014452 (26/08/2026, $5.558.513,27): caños galvanizados 3" y 1 1/2" y caño
-- negro 3" para CC-018 CONCEPCION PL (dueño, 25/09; «Materiales y repuestos» en su plan →
-- concepto «Materiales de obra»). Imputada 100% a CC-018 (lo imputable = total − percepciones).
--
-- Pago (listados de Galicia, 27/08 09:35): e-cheq propio 2977 «fac 14452/14453» ($54.311,65) +
-- 4 e-cheqs endosados: Nación 3299 de Gravano Juan Agustín ($4.669.999,55) y ICBC 14321863/64/65
-- de Casilda Combustibles ($284.000 c/u). Total $5.576.311,20 = FA 14452 + FA 14453 ($17.797,93),
-- exacto. Una OP reconstruida para las dos.

do $m$
declare u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  insert into public.pagos_facturas_adjuntos (factura_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, created_by, updated_by)
  values (652, 'factura', 'facturas/652/3ce1d6c0-42d0-4fbf-b033-6f232b1e6102.pdf', 'FA A 0043-00014452 Hierronort.pdf',
          '00e902ae700af782cedeea82322717a99f051ed5f1d3df0aaf12b1de1b61d075', 'application/pdf', 23431, u, u);
  perform public.pagos_imputar_lote(array[652]::bigint[], (select id from public.pagos_conceptos where nombre = 'Materiales de obra'), 'CC-018', u);
  perform public.pagos_reconstruir_orden(13,
    jsonb_build_object('fecha','2026-08-27','forma_pago','echeq','monto_pagado',5576311.20,'cuenta_origen_id',1,
      'referencia','27/08 09:35 (listados de Galicia): e-cheq propio 2977 «fac 14452/14453» + 4 e-cheqs de terceros endosados',
      'obs','Pago reconstruido el 25/09 en la conciliación con Hierronort.',
      'cheques', jsonb_build_array(
        jsonb_build_object('numero','2977','banco','Galicia','fecha_cobro','2026-08-28','monto',54311.65,'es_propio',true,'librador',''),
        jsonb_build_object('numero','3299','banco','Nación','fecha_cobro','2026-09-18','monto',4669999.55,'es_propio',false,'librador','GRAVANO JUAN AGUSTIN'),
        jsonb_build_object('numero','14321863','banco','ICBC','fecha_cobro','2026-09-13','monto',284000,'es_propio',false,'librador','CASILDA COMBUSTIBLES SRL'),
        jsonb_build_object('numero','14321864','banco','ICBC','fecha_cobro','2026-09-15','monto',284000,'es_propio',false,'librador','CASILDA COMBUSTIBLES SRL'),
        jsonb_build_object('numero','14321865','banco','ICBC','fecha_cobro','2026-09-16','monto',284000,'es_propio',false,'librador','CASILDA COMBUSTIBLES SRL'))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',652,'monto',5558513.27), jsonb_build_object('tipo','factura','factura_id',653,'monto',17797.93)), u);
end
$m$;
