create table if not exists caja_conceptos (
  id      serial primary key,
  nombre  text not null unique,
  tipo    text check (tipo in ('ingreso','egreso','ambos')) default 'ambos',
  activo  boolean not null default true
);

create table if not exists caja_centros_costo (
  id      serial primary key,
  nombre  text not null unique,
  activo  boolean not null default true
);

create table if not exists movimientos_caja (
  id            serial primary key,
  fecha         date not null,
  centro_costo  text,
  proveedor     text,
  concepto      text not null,
  detalle       text,
  tipo          text not null check (tipo in ('ingreso','egreso')),
  monto         numeric(12,2) not null check (monto > 0),
  saldo_acum    numeric(12,2),
  es_ajuste     boolean not null default false,
  creado_por    text,
  created_at    timestamptz not null default now()
);

-- RLS: habilitar y permitir usuarios autenticados
alter table caja_conceptos      enable row level security;
alter table caja_centros_costo  enable row level security;
alter table movimientos_caja    enable row level security;

create policy "auth_all" on caja_conceptos      for all to authenticated using (true) with check (true);
create policy "auth_all" on caja_centros_costo  for all to authenticated using (true) with check (true);
create policy "auth_all" on movimientos_caja    for all to authenticated using (true) with check (true);
