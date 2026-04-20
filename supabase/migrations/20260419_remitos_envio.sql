-- Remitos de envío de materiales a obras
create table if not exists remitos_envio (
  id           serial primary key,
  numero       text not null unique,
  fecha        date not null default current_date,
  obra_cod     text not null references obras(cod),
  solicitud_id int references solicitud_compra(id),
  origen       text not null default 'deposito',
  obs          text,
  created_at   timestamptz default now(),
  created_by   uuid references auth.users(id)
);

create table if not exists remitos_envio_item (
  id           serial primary key,
  remito_id    int not null references remitos_envio(id) on delete cascade,
  item_id      int references solicitud_compra_item(id),
  descripcion  text not null,
  cantidad     numeric not null,
  unidad       text not null,
  precio_unit  numeric,
  origen       text not null default 'deposito',
  proveedor    text
);

-- Secuencia para número de remito
create sequence if not exists remito_envio_seq start 1;

-- Agregar remito_id a solicitud_compra_item para vincular
alter table solicitud_compra_item
  add column if not exists remito_envio_id int references remitos_envio(id);

alter table remitos_envio enable row level security;
alter table remitos_envio_item enable row level security;

create policy "remitos_envio_all" on remitos_envio for all using (true) with check (true);
create policy "remitos_envio_item_all" on remitos_envio_item for all using (true) with check (true);
