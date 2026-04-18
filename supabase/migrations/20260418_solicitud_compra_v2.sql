-- =====================================================================
-- v2: Estado por ítem, proveedores, facturas, materiales a cuenta cliente
-- =====================================================================

-- ── Proveedores ──────────────────────────────────────────────────────
create table if not exists proveedores (
  id         serial primary key,
  nombre     text not null,
  cuit       text,
  tel        text,
  email      text,
  obs        text,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

alter table proveedores enable row level security;
create policy "proveedores_all" on proveedores
  for all using (true) with check (true);

-- ── Facturas de compra ───────────────────────────────────────────────
create table if not exists facturas_compra (
  id              serial primary key,
  proveedor_id    int not null references proveedores(id),
  numero          text,
  fecha           date not null default current_date,
  adjunto_url     text,
  adjunto_nombre  text,
  total           numeric,
  obs             text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id)
);

alter table facturas_compra enable row level security;
create policy "facturas_compra_all" on facturas_compra
  for all using (true) with check (true);

-- ── Alter solicitud_compra: reducir estados a aprobación ─────────────
-- Quitar fecha_envio (ahora es por ítem)
alter table solicitud_compra drop column if exists fecha_envio;

-- Actualizar constraint de estado: solo pendiente/aprobada/rechazada
-- Primero migrar datos existentes
update solicitud_compra set estado = 'aprobada'
  where estado in ('enviada', 'recibida');

alter table solicitud_compra drop constraint if exists solicitud_compra_estado_check;
alter table solicitud_compra add constraint solicitud_compra_estado_check
  check (estado in ('pendiente', 'aprobada', 'rechazada'));

-- ── Alter solicitud_compra_item: agregar estado + resolución ─────────
alter table solicitud_compra_item
  add column if not exists estado text not null default 'pendiente'
    check (estado in ('pendiente', 'comprado', 'de_deposito', 'enviado', 'rechazado'));

alter table solicitud_compra_item
  add column if not exists proveedor_id int references proveedores(id);

alter table solicitud_compra_item
  add column if not exists precio_unit numeric;

alter table solicitud_compra_item
  add column if not exists factura_id int references facturas_compra(id);

alter table solicitud_compra_item
  add column if not exists fecha_resolucion date;

alter table solicitud_compra_item
  add column if not exists fecha_envio date;

-- ── Materiales a cuenta de cliente ───────────────────────────────────
create table if not exists materiales_a_cuenta_cliente (
  id               serial primary key,
  obra_cod         text not null references obras(cod),
  solicitud_id     int not null references solicitud_compra(id),
  item_id          int not null references solicitud_compra_item(id) unique,
  descripcion      text not null,
  cantidad         numeric not null,
  unidad           text not null,
  precio_unit      numeric not null,
  precio_total     numeric not null,
  origen           text not null check (origen in ('proveedor', 'deposito')),
  proveedor_id     int references proveedores(id),
  factura_id       int references facturas_compra(id),
  fecha_resolucion date not null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id)
);

alter table materiales_a_cuenta_cliente enable row level security;
create policy "materiales_a_cuenta_cliente_all" on materiales_a_cuenta_cliente
  for all using (true) with check (true);
