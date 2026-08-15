-- Adjunto de la cotización del contratista (foto/PDF del presupuesto).
-- Mismo esquema de campos que el DNI del contratista; el archivo vive en el
-- bucket privado contratista-docs bajo cotizacion/{obra}/{contratId}/.
alter table public.asig_contrat
  add column if not exists cotizacion_doc_path   text,
  add column if not exists cotizacion_doc_nombre text,
  add column if not exists cotizacion_doc_mime   text,
  add column if not exists cotizacion_doc_size   integer,
  add column if not exists cotizacion_doc_hash   text;
