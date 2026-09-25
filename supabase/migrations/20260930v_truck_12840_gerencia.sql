-- Truck NOA FA A 0007-00012840 (24/09/2026, $81.300): válvula VW 07W130602B. Dueño, 25/09: va al
-- centro de costo gerencial, concepto «Mantenimiento y repuestos». Había entrado imputada a CC-020
-- (la obra habitual del proveedor, 20260930p): se reemplaza el reparto. PDF adjunto.

do $m$
declare u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  insert into public.pagos_facturas_adjuntos (factura_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, created_by, updated_by)
  values (967, 'factura', 'facturas/967/4fa97736-76bd-4722-94b2-38823043f238.pdf', 'FC_A-0007-00012840.pdf',
          '368394a7b1cff083536cf50f1bdfcf099c0f202cdc7e6df627382780ef75d594', 'application/pdf', 98193, u, u);
  perform public._pagos_reemplazar_imputaciones(967, jsonb_build_array(jsonb_build_object('obra_cod', 'CC GERENCIA', 'monto', 81300)), u);
  update public.pagos_facturas set concepto_id = (select id from public.pagos_conceptos where nombre = 'Mantenimiento y repuestos'), updated_by = u
   where id = 967;
end
$m$;
