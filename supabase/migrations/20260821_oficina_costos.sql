-- =====================================================================
-- Costos de oficina: personal administrativo (NO operarios de `personal`),
-- sueldo mensual versionado (patrón categoria_tarifas) y asignación
-- porcentual a destinos versionada por snapshot (desde-only).
-- Gate de lectura/escritura: backend Hono, flag permisos.tarja.costos_oficina.
-- =====================================================================

-- ── 1. Personas de oficina ───────────────────────────────────────────
create table if not exists oficina_personal (
  id          serial primary key,
  nombre      text not null check (length(trim(nombre)) > 0),
  activo      boolean not null default true,
  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table oficina_personal is
  'Personal de oficina/administración para prorrateo de costos indirectos. NO son los operarios de `personal`.';

-- ── 2. Sueldos versionados (costo empresa mensual) ───────────────────
create table if not exists oficina_sueldos (
  id             serial primary key,
  persona_id     int not null references oficina_personal(id) on delete cascade,
  costo_mensual  numeric not null check (costo_mensual >= 0),
  desde          date not null,   -- primer día desde el que rige (nunca UPDATE in-place de versiones pasadas)
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint oficina_sueldos_persona_desde_uq unique (persona_id, desde)
);
comment on table oficina_sueldos is
  'Historial del costo empresa mensual por persona de oficina. Vigente a una fecha = fila más reciente con desde <= fecha. Espejo del patrón categoria_tarifas.';
create index if not exists oficina_sueldos_persona_desde_idx
  on oficina_sueldos (persona_id, desde);

-- ── 3. Asignaciones por snapshot ─────────────────────────────────────
-- Un snapshot = todas las filas con el mismo (persona_id, desde): la
-- distribución COMPLETA vigente desde esa fecha. El backend valida que
-- cada snapshot sume 100%. Resolución: snapshot con mayor desde <= fechaRef.
create table if not exists oficina_asignaciones (
  id          serial primary key,
  persona_id  int not null references oficina_personal(id) on delete cascade,
  desde       date not null,
  destino     text not null check (destino in ('obra', 'logistica', 'general')),
  obra_cod    text references obras(cod),
  porcentaje  numeric(5,2) not null check (porcentaje > 0 and porcentaje <= 100),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  -- obra_cod obligatorio sii destino='obra'
  constraint oficina_asig_obra_cod_chk
    check ((destino = 'obra') = (obra_cod is not null))
);
comment on table oficina_asignaciones is
  'Snapshot versionado de distribución de costo por persona de oficina. Filas con igual (persona_id, desde) forman un snapshot que debe sumar 100% (validado en backend).';
-- unique con obra_cod nullable: usar coalesce para que dos filas
-- 'logistica' del mismo snapshot no dupliquen.
create unique index if not exists oficina_asig_snapshot_destino_uq
  on oficina_asignaciones (persona_id, desde, destino, coalesce(obra_cod, ''));
create index if not exists oficina_asig_persona_desde_idx
  on oficina_asignaciones (persona_id, desde);

-- ── 4. Trigger updated_at (reusa set_updated_at global) ──────────────
drop trigger if exists oficina_personal_set_updated_at on oficina_personal;
create trigger oficina_personal_set_updated_at
  before update on oficina_personal
  for each row execute function set_updated_at();
drop trigger if exists oficina_sueldos_set_updated_at on oficina_sueldos;
create trigger oficina_sueldos_set_updated_at
  before update on oficina_sueldos
  for each row execute function set_updated_at();

-- ── 5. RLS permisiva (modelo del proyecto, §5.4) ─────────────────────
alter table oficina_personal      enable row level security;
alter table oficina_sueldos       enable row level security;
alter table oficina_asignaciones  enable row level security;
drop policy if exists "auth_all" on oficina_personal;
create policy "auth_all" on oficina_personal
  for all to authenticated using (true) with check (true);
drop policy if exists "auth_all" on oficina_sueldos;
create policy "auth_all" on oficina_sueldos
  for all to authenticated using (true) with check (true);
drop policy if exists "auth_all" on oficina_asignaciones;
create policy "auth_all" on oficina_asignaciones
  for all to authenticated using (true) with check (true);
