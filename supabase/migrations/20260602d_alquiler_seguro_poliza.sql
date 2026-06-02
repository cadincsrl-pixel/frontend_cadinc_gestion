-- ═══════════════════════════════════════════════════════════════════
--  ALQUILER — póliza de seguro adjunta + vencimiento por máquina
-- ───────────────────────────────────────────────────────────────────
--  Pedido del user: adjuntar la póliza del seguro (PDF/foto) a la máquina
--  y cargar la fecha de vencimiento, para que salte una alerta en la
--  campana del módulo Alquiler cuando esté vencida o por vencer.
--
--  Diseño: UNA póliza por máquina (no un sub-sistema multi-doc). Los datos
--  viven como campos en `alquiler_maquinas` — el `seguro_vence` queda a
--  mano para la query de notificaciones (sin joins). El archivo va al
--  bucket privado `alquiler-docs` con el MISMO flujo probado de
--  vehiculo-docs (signed upload URL → registrar → signed URL para ver).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Bucket privado para la póliza (idéntico a vehiculo-docs: 10MB, img+pdf).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'alquiler-docs', 'alquiler-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;

-- 2. Campos del seguro en la máquina (seguro [texto] ya existe de antes).
alter table public.alquiler_maquinas
  add column if not exists seguro_vence        date,
  add column if not exists seguro_poliza_path   text,
  add column if not exists seguro_poliza_nombre text,
  add column if not exists seguro_poliza_mime   text,
  add column if not exists seguro_poliza_size   integer,
  add column if not exists seguro_poliza_hash   text;

-- 3. Índice para la campana (máquinas con vencimiento cargado).
create index if not exists alquiler_maquinas_seguro_vence_idx
  on public.alquiler_maquinas (seguro_vence)
  where seguro_vence is not null;
