-- Monteros Hormigón FA A 0002-00000784 (27/07/2026, $8.369.892,39): 45 m³ de hormigón H25 para
-- CC-018 CONCEPCION PL (dueño, 25/09).
--
-- 1) PDF adjunto (se sube aparte a pagos-docs; acá la fila).
-- 2) Imputada 100% a CC-018, concepto «Materiales de obra».
-- 3) Pagada el 28/07 13:37 con dos e-cheqs que suman exacto el total (listados de Galicia):
--      e-cheq propio 2883 por $3.928.965,82 (pago 28/09; «Orden de pago / montero hormigon fac 784»)
--      e-cheq 3697 de Maghreb S.A. endosado (recibido de Trans Arenas) por $4.440.926,57 (pago 13/08)
--    Una OP reconstruida con los dos cheques.

do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  insert into public.pagos_facturas_adjuntos (factura_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, created_by, updated_by)
  values (260, 'factura', 'facturas/260/b013978d-8083-466e-8330-ab9fc9aaaa8c.pdf', 'FA A 0002-00000784 Monteros Hormigon.pdf',
          'a840f14bd2ddb3529ed3ec1d02fb6fe708e058b80373c6e5365607fc49820947', 'application/pdf', 18834, u, u);

  perform public.pagos_imputar_lote(array[260]::bigint[], (select id from public.pagos_conceptos where nombre = 'Materiales de obra'), 'CC-018', u);

  perform public.pagos_reconstruir_orden(114,
    jsonb_build_object('fecha', '2026-07-28', 'forma_pago', 'echeq', 'monto_pagado', 8369892.39, 'cuenta_origen_id', 1,
      'referencia', 'E-cheq Galicia 2883 (propio) + e-cheq Galicia 3697 de Maghreb endosado, ambos el 28/07 13:37 — listados de Galicia',
      'obs', 'Pago reconstruido el 25/09 en la conciliación con Monteros Hormigón.',
      'cheques', jsonb_build_array(
        jsonb_build_object('numero', '2883', 'banco', 'Galicia', 'fecha_cobro', '2026-09-28', 'monto', 3928965.82, 'es_propio', true, 'librador', ''),
        jsonb_build_object('numero', '3697', 'banco', 'Galicia', 'fecha_cobro', '2026-08-13', 'monto', 4440926.57, 'es_propio', false,
                           'librador', 'MAGHREB S. A. · CUIT 30718033159'))),
    jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', 260, 'monto', 8369892.39)), u);
end
$m$;
