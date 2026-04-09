-- ── Préstamos a albañiles ──────────────────────────────────────────────────
create table if not exists prestamos (
  id          bigint generated always as identity primary key,
  leg         text        not null,          -- legajo del trabajador
  sem_key     text        not null,          -- viernes de la semana (YYYY-MM-DD)
  tipo        text        not null check (tipo in ('otorgado', 'descontado')),
  monto       numeric     not null check (monto > 0),
  concepto    text,
  created_by  uuid        references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table prestamos enable row level security;

create policy "authenticated read prestamos"
  on prestamos for select to authenticated using (true);

create policy "authenticated insert prestamos"
  on prestamos for insert to authenticated with check (true);

create policy "authenticated delete prestamos"
  on prestamos for delete to authenticated using (true);
