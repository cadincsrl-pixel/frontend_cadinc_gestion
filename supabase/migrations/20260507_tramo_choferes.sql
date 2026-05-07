-- =====================================================================
-- Relevos de chofer en un tramo. Cuando un tramo es relevado en un punto
-- intermedio (típicamente Chivilcoy), participan 2 choferes y hay que
-- repartir km/jornales para liquidar a cada uno.
--
-- Diseño:
-- - tramo_choferes está vacía cuando el tramo NO tiene relevo (un solo
--   chofer; el cálculo sigue usando tramos.chofer_id como hoy).
-- - Cuando hay relevo, hay exactamente 2 filas: orden=1 chofer original,
--   orden=2 chofer relevista. La fuente de verdad para liquidación de
--   ese tramo es esta tabla.
-- - El tramo sigue siendo facturable una sola vez (no toca cobros ni
--   `tramos.cobro_id`).
-- =====================================================================

create table if not exists public.tramo_choferes (
  id            bigserial primary key,
  tramo_id      integer not null references public.tramos(id) on delete cascade,
  chofer_id     integer not null references public.choferes(id),
  orden         smallint not null check (orden in (1, 2)),
  km_cargado    numeric(8, 2) not null default 0 check (km_cargado >= 0),
  km_vacio      numeric(8, 2) not null default 0 check (km_vacio   >= 0),
  jornales      numeric(4, 2) not null default 1 check (jornales   >= 0),
  lugar_relevo  text,
  obs           text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

create unique index if not exists tramo_choferes_tramo_orden_uq
  on public.tramo_choferes (tramo_id, orden);

create index if not exists tramo_choferes_chofer_idx
  on public.tramo_choferes (chofer_id);

create or replace function public._tramo_choferes_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_tramo_choferes_touch on public.tramo_choferes;
create trigger trg_tramo_choferes_touch
  before update on public.tramo_choferes
  for each row execute function public._tramo_choferes_touch_updated_at();

alter table public.tramo_choferes enable row level security;
drop policy if exists tramo_choferes_all on public.tramo_choferes;
create policy tramo_choferes_all on public.tramo_choferes
  for all using (true) with check (true);
