-- ═══════════════════════════════════════════════════════════════════
--  CONTRATISTAS (tarja) — datos ampliados + DNI adjunto
-- ───────────────────────────────────────────────────────────────────
--  Pedido del user: mejorar el modal de carga de contratistas con nombre
--  completo, razón social, CUIT, CUIL, DNI (número + documento adjunto),
--  teléfono (ya existía) y especialidad como texto libre (ya es text).
--
--  `nom` (existente) pasa a ser "Nombre completo" en la UI. Se agregan los
--  campos nuevos + el DNI como número (texto) y como documento adjunto
--  (mismo flujo de vehiculo-docs/seguro-poliza: bucket privado + signed URL).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Bucket privado para el DNI del contratista (10MB, img+pdf).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratista-docs', 'contratista-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;

-- 2. Campos nuevos en contratistas (todos opcionales).
alter table public.contratistas
  add column if not exists razon_social   text,
  add column if not exists cuit           text,
  add column if not exists cuil           text,
  add column if not exists dni            text,
  add column if not exists dni_doc_path   text,
  add column if not exists dni_doc_nombre text,
  add column if not exists dni_doc_mime   text,
  add column if not exists dni_doc_size   integer,
  add column if not exists dni_doc_hash   text;
