-- Solicitudes de compra / envío de materiales a obras
create table if not exists solicitud_compra (
  id           serial primary key,
  obra_cod     text not null references obras(cod),
  solicitante  uuid references auth.users(id),
  fecha        date not null default current_date,
  estado       text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'enviada', 'recibida')),
  prioridad    text not null default 'normal'
    check (prioridad in ('normal', 'urgente')),
  obs          text,
  aprobado_por uuid references auth.users(id),
  fecha_envio  date,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  created_by   uuid references auth.users(id),
  updated_by   uuid references auth.users(id)
);

create table if not exists solicitud_compra_item (
  id            serial primary key,
  solicitud_id  int not null references solicitud_compra(id) on delete cascade,
  descripcion   text not null,
  cantidad      numeric not null default 1,
  unidad        text not null default 'unid'
    check (unidad in ('unid', 'kg', 'tn', 'lt', 'm', 'm2', 'm3', 'gl')),
  obs           text
);

-- RLS
alter table solicitud_compra enable row level security;
alter table solicitud_compra_item enable row level security;

create policy "solicitud_compra_all" on solicitud_compra
  for all using (true) with check (true);

create policy "solicitud_compra_item_all" on solicitud_compra_item
  for all using (true) with check (true);
