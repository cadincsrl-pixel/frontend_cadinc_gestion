-- Cubiertas puestas a cada camión: registro histórico en el legajo.
--
-- Alcance deliberadamente chico (definido con Franco el 29/07): sólo cuántas
-- cubiertas se pusieron, cuándo y con cuántos km el camión.
--   · SIN alerta por km — no la quiere.
--   · SIN costo ni link a gastos — el gasto lo carga por separado, como hoy.
--   · SIN separar batea — cada camión anda siempre con la misma, así que las
--     cubiertas del equipo se registran contra el camión.
-- Si algo de eso cambia, se agrega encima; la tabla no lo impide.
--
-- Los km sirven para responder "¿cada cuánto le cambio las gomas?": la
-- diferencia entre un registro y el anterior es la vida útil real, que hoy
-- nadie sabe (el simulador de rentabilidad estima 200.000 km sin respaldo).

create table if not exists public.camion_cubiertas (
  id          serial primary key,
  camion_id   integer not null references public.camiones(id),
  fecha       date    not null default current_date,
  -- Km del camión al momento del cambio. Se carga a mano: el odómetro del GPS
  -- puede no estar al día y este dato tiene que ser el del service real.
  km_camion   numeric not null default 0 check (km_camion >= 0),
  cantidad    integer not null check (cantidad > 0),
  obs         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  -- Soft delete, igual que camion_services: un cambio de cubiertas es historia
  -- del camión y borrarlo de verdad perdería el hilo de la vida útil.
  deleted_at  timestamptz
);

create index if not exists camion_cubiertas_camion_idx
  on public.camion_cubiertas (camion_id, fecha desc)
  where deleted_at is null;

comment on table public.camion_cubiertas is
  'Cubiertas puestas a cada camión (legajo). Sin alerta ni costo: el gasto se carga aparte en gastos_logistica.';
comment on column public.camion_cubiertas.km_camion is
  'Km del camión cuando se pusieron. La diferencia con el registro anterior es la vida útil real del juego.';

alter table public.camion_cubiertas enable row level security;

-- RLS permisiva, igual que el resto del esquema: la autorización real está en
-- el backend Hono (requirePermiso). Ver CLAUDE.md §5.4.
drop policy if exists auth_all on public.camion_cubiertas;
create policy auth_all on public.camion_cubiertas
  for all to authenticated using (true) with check (true);

drop trigger if exists trg_audit_camion_cubiertas on public.camion_cubiertas;
create trigger trg_audit_camion_cubiertas
  before insert or update on public.camion_cubiertas
  for each row execute function public.set_audit_fields();
