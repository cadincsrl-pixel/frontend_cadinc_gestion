-- ── Ropa de trabajo ───────────────────────────────────────────────────────

-- Categorías de elementos (pantalón, botines, camisa, casco, etc.)
create table if not exists ropa_categorias (
  id      serial primary key,
  nombre  text    not null,
  icono   text,
  activo  boolean not null default true
);

-- Datos iniciales
insert into ropa_categorias (nombre, icono) values
  ('Pantalón', '👖'),
  ('Botines',  '👟'),
  ('Camisa',   '👕');

-- Entregas
create table if not exists ropa_entregas (
  id             bigint generated always as identity primary key,
  leg            text    not null,
  categoria_id   int     not null references ropa_categorias(id),
  fecha_entrega  date    not null,
  obs            text,
  created_by     uuid    references auth.users(id),
  created_at     timestamptz not null default now()
);

-- RLS
alter table ropa_categorias enable row level security;
alter table ropa_entregas   enable row level security;

create policy "auth read ropa_categorias"   on ropa_categorias for select    to authenticated using (true);
create policy "auth insert ropa_categorias" on ropa_categorias for insert    to authenticated with check (true);
create policy "auth update ropa_categorias" on ropa_categorias for update    to authenticated using (true);

create policy "auth read ropa_entregas"     on ropa_entregas   for select    to authenticated using (true);
create policy "auth insert ropa_entregas"   on ropa_entregas   for insert    to authenticated with check (true);
create policy "auth delete ropa_entregas"   on ropa_entregas   for delete    to authenticated using (true);

-- Override activo manual en personal
alter table personal
  add column if not exists activo_override boolean;
2