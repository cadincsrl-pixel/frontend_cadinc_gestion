-- =====================================================================
-- Historial versionado del precio global por categoría (valor hora)
--
-- Problema que resuelve: `categorias.vh` era un único valor que se pisaba
-- al editar (UPDATE in-place). Los reportes recalculan horas × VH vigente
-- y el global es el fallback cuando la obra no tiene tarifa propia, así
-- que cada edición del global recalculaba retroactivamente TODA la
-- historia (incidente 2026-06-26: aumento ~7% pisó costos de semanas ya
-- pagadas en casi todas las obras).
--
-- Modelo: espejo de `tarifas` (por obra) pero a nivel global.
--   Una fila (cat_id, vh, desde) por cada cambio de precio.
--   Resolución (igual que tarifas de obra): la más reciente con
--   desde <= fechaRef; si todas son futuras, la más antigua (retroactiva).
--   `categorias.vh` queda como cache de la ÚLTIMA versión, para los
--   displays de "precio actual" (selects, labels, TarifasPanel).
--
-- Seed:
--   - Baseline 2026-01-01 con los valores PRE-aumento. Los de cats 1-4 se
--     recuperaron por extrapolación del Excel de pagos del 19/06/2026
--     (14/14 obras coinciden al peso con horas de DB + redondeo por leg).
--   - Versión 2026-06-19 con el aumento (~7%) que cargó administración el
--     26/06; vigencia desde la semana 19-25/06 confirmada por gerencia.
-- =====================================================================


-- ── 1. Tabla categoria_tarifas ───────────────────────────────────────
create table if not exists categoria_tarifas (
  id          serial primary key,

  cat_id      int not null references categorias(id) on delete cascade,
  vh          numeric not null check (vh >= 0),
  desde       date not null,                    -- desde cuándo rige (viernes de semana, convención sem_key)

  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categoria_tarifas_cat_desde_uq
    unique (cat_id, desde)
);

comment on table categoria_tarifas is
  'Historial del precio global (valor hora) por categoría. Espejo global de `tarifas` (por obra). VH vigente a una fecha = fila más reciente con desde <= fecha; si todas son futuras, la más antigua (retroactiva). categorias.vh cachea la última versión.';

comment on column categoria_tarifas.desde is
  'Fecha desde la que rige el precio (viernes de la semana, convención sem_key).';


-- ── 2. Índice ────────────────────────────────────────────────────────
create index if not exists categoria_tarifas_cat_desde_idx
  on categoria_tarifas (cat_id, desde);


-- ── 3. Trigger updated_at (reusa set_updated_at global) ──────────────
drop trigger if exists categoria_tarifas_set_updated_at on categoria_tarifas;
create trigger categoria_tarifas_set_updated_at
  before update on categoria_tarifas
  for each row execute function set_updated_at();


-- ── 4. RLS permisiva (consistente con el resto del proyecto) ─────────
alter table categoria_tarifas enable row level security;

drop policy if exists "auth_all" on categoria_tarifas;
create policy "auth_all" on categoria_tarifas
  for all to authenticated using (true) with check (true);


-- ── 5. Seed ──────────────────────────────────────────────────────────
-- Baseline pre-aumento (valores vigentes desde el arranque del sistema).
insert into categoria_tarifas (cat_id, vh, desde) values
  (1,  4300, '2026-01-01'),   -- Oficial Albañil
  (2,  3700, '2026-01-01'),   -- Medio Oficial
  (3,  3500, '2026-01-01'),   -- Ayudante / Peón
  (4,  5000, '2026-01-01'),   -- Oficial Especializado
  (5,  3000, '2026-01-01'),   -- Electricista
  (6,  2900, '2026-01-01'),   -- Sanitarista
  (7,  3500, '2026-01-01'),   -- Capataz
  (10, 0,    '2026-01-01'),   -- OFICINA
  (11, 0,    '2026-01-01')    -- acompañar
on conflict (cat_id, desde) do nothing;

-- Aumento ~7% cargado el 2026-06-26, vigente desde la semana 2026-06-19.
insert into categoria_tarifas (cat_id, vh, desde) values
  (1, 4600, '2026-06-19'),
  (2, 3950, '2026-06-19'),
  (3, 3750, '2026-06-19'),
  (4, 5350, '2026-06-19')
on conflict (cat_id, desde) do nothing;
