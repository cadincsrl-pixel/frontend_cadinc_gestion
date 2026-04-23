-- =====================================================================
-- Horas extras del operario por (obra, legajo, semana)
--
-- Registra una cantidad de horas extras por tupla (obra_cod, leg, sem_key).
-- Es "molde prestamos-like": un monto/cantidad extra por (leg, sem_key),
-- scopeado además por obra porque la tarja se arma por obra-semana (igual
-- que `horas` y `cierres`).
--
-- Diferencias vs `horas`:
--   - `horas` es por día; `tarja_hs_extras` es agregado semanal.
--   - `hs` es cantidad pura. Se paga al MISMO VH efectivo que las horas
--     normales de esa semana (sin multiplicador 1.5x/2x). El cálculo del
--     adicional monetario es hs × getVHConCatObra(obra, leg, sem_key).
--
-- UNIQUE(obra_cod, leg, sem_key) → upsert desde el grid de tarja.
-- RLS permisiva (patrón backend-as-gateway del proyecto).
-- =====================================================================


-- ── 1. Tabla tarja_hs_extras ─────────────────────────────────────────
create table if not exists tarja_hs_extras (
  id          serial primary key,

  obra_cod    text not null references obras(cod) on delete cascade,
  leg         text not null references personal(leg) on delete cascade,
  sem_key     date not null,                     -- viernes de la semana (YYYY-MM-DD)

  hs          numeric not null check (hs >= 0 and hs <= 200),

  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tarja_hs_extras_obra_leg_sem_uq
    unique (obra_cod, leg, sem_key)
);

comment on table tarja_hs_extras is
  'Horas extras del operario por (obra, legajo, semana). Cantidad pura de horas; el multiplicador se aplica en liquidación. Una fila por tupla (upsert).';

comment on column tarja_hs_extras.sem_key is
  'YYYY-MM-DD del viernes de la semana, convención compartida con prestamos y cierres.';

comment on column tarja_hs_extras.hs is
  'Cantidad pura de horas extras. Se paga al mismo VH efectivo que las horas normales de esa semana. Rango [0, 200] para atrapar tipeos groseros.';


-- ── 2. Índices ───────────────────────────────────────────────────────
-- Grid de tarja por obra+semana (listado principal).
create index if not exists tarja_hs_extras_obra_sem_idx
  on tarja_hs_extras (obra_cod, sem_key);

-- Recibos/consultas por operario (historial de hs extras del legajo).
create index if not exists tarja_hs_extras_leg_sem_idx
  on tarja_hs_extras (leg, sem_key);


-- ── 3. Trigger updated_at (reusa set_updated_at global) ──────────────
drop trigger if exists tarja_hs_extras_set_updated_at on tarja_hs_extras;
create trigger tarja_hs_extras_set_updated_at
  before update on tarja_hs_extras
  for each row execute function set_updated_at();


-- ── 4. RLS permisiva (consistente con el resto del proyecto) ─────────
alter table tarja_hs_extras enable row level security;

drop policy if exists "auth_all" on tarja_hs_extras;
create policy "auth_all" on tarja_hs_extras
  for all to authenticated using (true) with check (true);
