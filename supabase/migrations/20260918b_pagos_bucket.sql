-- =====================================================================
-- Módulo Pagos, fase 1 — bucket `pagos-docs` (2026-09-18)
--
-- Privado, 10 MB, imagen o PDF (mismo molde que cobros-docs, 20260427).
-- Guarda:
--   facturas/<factura_id>/<uuid>.<ext>   → pagos_facturas_adjuntos
--   ordenes/<orden_id>/<uuid>.<ext>      → pagos_ordenes_adjuntos
--   ordenes/pendientes/<uuid>.<ext>      → comprobante subido ANTES de la fila
--                                          (el backend lo mueve tras el commit)
--
-- Sin policies en storage.objects: el flujo es firmado (createSignedUploadUrl /
-- createSignedUrl) con service_role desde el backend, así que nadie escribe ni
-- lee el bucket con la anon key. Igual que alquiler-docs, aridos-docs y
-- contratista-docs.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pagos-docs', 'pagos-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
