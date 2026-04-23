-- =====================================================================
-- Gastos operativos de logística (combustible, gomería, lavadero, etc.)
--
-- Una tabla central con FKs opcionales a camión/chofer/tramo/lugar (al
-- menos una requerida). Workflow de aprobación con default 'pendiente'
-- para prevenir auto-aprobación (separación de funciones enforced en el
-- backend). Hash único del comprobante para prevenir duplicados
-- fraudulentos. Soft delete para mantener audit trail incorruptible.
--
-- Coexiste con la tabla legacy `camiones_gastos` (20260409_logistica.sql).
-- Plan de backfill + deprecación en migración futura si hay datos vivos.
-- =====================================================================


-- ── 1. Catálogo de categorías (editable, no hardcoded en CHECK) ──────
create table if not exists gastos_categorias (
  id          serial primary key,
  codigo      text not null unique,
  nombre      text not null,
  aplica_a    text not null default 'ambos'
              check (aplica_a in ('camion', 'chofer', 'ambos')),
  activo      boolean not null default true,
  orden       smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table gastos_categorias enable row level security;
create policy "auth_all" on gastos_categorias
  for all to authenticated using (true) with check (true);

insert into gastos_categorias (codigo, nombre, aplica_a, orden) values
  ('combustible',     'Combustible',          'ambos',  10),
  ('gomeria',         'Gomería',              'camion', 20),
  ('lavadero',        'Lavadero',             'camion', 30),
  ('mantenimiento',   'Mantenimiento',        'camion', 40),
  ('peaje',           'Peaje',                'ambos',  50),
  ('viatico',         'Viático',              'chofer', 60),
  ('seguro',          'Seguro',               'camion', 70),
  ('patente',         'Patente / impuestos',  'camion', 80),
  ('multa',           'Multa',                'ambos',  90),
  ('estacionamiento', 'Estacionamiento',      'ambos', 100),
  ('otros',           'Otros',                'ambos', 999)
on conflict (codigo) do nothing;


-- ── 2. Tabla principal ──────────────────────────────────────────────
create table if not exists gastos_logistica (
  id                serial primary key,

  -- Asociaciones (al menos una requerida — CHECK abajo)
  camion_id         integer references camiones(id)  on delete restrict,
  chofer_id         integer references choferes(id)  on delete restrict,
  tramo_id          integer references tramos(id)    on delete set null,
  lugar_id          integer references lugares(id)   on delete set null,

  categoria_id      integer not null references gastos_categorias(id) on delete restrict,

  -- Datos del gasto
  fecha             date not null,
  monto             numeric(12,2) not null check (monto > 0),
  descripcion       text not null default '',
  proveedor         text,

  -- Pago
  metodo_pago       text not null default 'efectivo'
                    check (metodo_pago in ('efectivo','transferencia','tarjeta','cheque','cta_cte','otro')),
  pagado_por        text not null default 'empresa'
                    check (pagado_por in ('empresa','chofer')),

  -- Comprobante
  comprobante_url   text,                                            -- path en bucket 'gastos-logistica'
  comprobante_nro   text,
  comprobante_hash  text,                                            -- sha256 hex; UNIQUE parcial abajo

  -- Workflow de aprobación (default 'pendiente' evita auto-aprobación)
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','aprobado','rechazado','pagado')),
  aprobado_por      uuid references auth.users(id),
  aprobado_at       timestamptz,
  motivo_rechazo    text,

  -- Integración con liquidaciones/adelantos (nullable; set por el cierre)
  adelanto_id       integer references adelantos(id)     on delete set null,
  liquidacion_id    integer references liquidaciones(id) on delete set null,

  obs               text not null default '',

  -- Soft delete (gastos aprobados nunca se borran, solo se anulan)
  deleted_at        timestamptz,

  -- Auditoría estándar del proyecto
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Al menos un sujeto asociado (defensivo; zod también lo valida)
  constraint gastos_logistica_sujeto_chk
    check (camion_id is not null or chofer_id is not null or tramo_id is not null or lugar_id is not null),

  -- Si fue rechazado, el motivo es obligatorio
  constraint gastos_logistica_rechazo_chk
    check (estado <> 'rechazado' or motivo_rechazo is not null)
);


-- ── 3. Índices ──────────────────────────────────────────────────────
-- Unique parcial sobre comprobante_hash: previene el mismo ticket subido
-- a múltiples gastos (fraude de reintegros inflados). Se permite null
-- (gastos sin comprobante) y se excluye soft-deleted del check.
create unique index if not exists gastos_logistica_comprobante_hash_uq
  on gastos_logistica (comprobante_hash)
  where comprobante_hash is not null and deleted_at is null;

-- Hot paths de consulta
create index if not exists gastos_logistica_camion_fecha_idx
  on gastos_logistica (camion_id, fecha desc)
  where camion_id is not null and deleted_at is null;

create index if not exists gastos_logistica_chofer_fecha_idx
  on gastos_logistica (chofer_id, fecha desc)
  where chofer_id is not null and deleted_at is null;

create index if not exists gastos_logistica_categoria_fecha_idx
  on gastos_logistica (categoria_id, fecha desc)
  where deleted_at is null;

create index if not exists gastos_logistica_tramo_idx
  on gastos_logistica (tramo_id)
  where tramo_id is not null and deleted_at is null;

create index if not exists gastos_logistica_estado_idx
  on gastos_logistica (estado, fecha desc)
  where estado = 'pendiente' and deleted_at is null;

-- Reintegros pendientes para liquidación: chofer X, pagado por chofer,
-- aprobado, aún no asignado a liquidación.
create index if not exists gastos_logistica_reintegro_idx
  on gastos_logistica (chofer_id, liquidacion_id)
  where pagado_por = 'chofer'
    and estado = 'aprobado'
    and liquidacion_id is null
    and deleted_at is null;


-- ── 4. Trigger updated_at ───────────────────────────────────────────
-- Reusa set_updated_at() si existe (definida en 20260408_remitos.sql).
-- Si no existe, la creamos idempotente.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gastos_logistica_set_updated_at on gastos_logistica;
create trigger gastos_logistica_set_updated_at
  before update on gastos_logistica
  for each row execute function set_updated_at();

drop trigger if exists gastos_categorias_set_updated_at on gastos_categorias;
create trigger gastos_categorias_set_updated_at
  before update on gastos_categorias
  for each row execute function set_updated_at();


-- ── 5. RLS permisiva (consistente con el resto del proyecto) ────────
alter table gastos_logistica enable row level security;
create policy "auth_all" on gastos_logistica
  for all to authenticated using (true) with check (true);


-- ── 6. Comments documentales ────────────────────────────────────────
comment on table  gastos_logistica is
  'Gastos operativos de logística (combustible, gomería, lavadero, etc.) asociados a camión/chofer/tramo/lugar. Workflow de aprobación con separación de funciones (backend enforza created_by != aprobado_por).';

comment on column gastos_logistica.pagado_por is
  '"chofer" con liquidacion_id null AND estado=aprobado = reintegro pendiente en próxima liquidación.';

comment on column gastos_logistica.comprobante_hash is
  'sha256 hex del archivo. UNIQUE parcial para prevenir el mismo comprobante reusado en múltiples gastos.';

comment on column gastos_logistica.deleted_at is
  'Soft delete. Los gastos aprobados o liquidados NUNCA se hard-delete. Corrección contable via contra-asiento.';


-- ── 7. Storage bucket (requiere crear manual en Dashboard) ──────────
-- Bucket: gastos-logistica
-- Public: false
-- allowed_mime_types: ['image/jpeg','image/png','image/webp','application/pdf']
-- file_size_limit: 10485760 (10 MB)
-- Path convention: gastos/{yyyy}/{mm}/{gasto_id}_{uuid}.{ext}
