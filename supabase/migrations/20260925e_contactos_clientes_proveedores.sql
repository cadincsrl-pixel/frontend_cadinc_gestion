-- Contactos múltiples para clientes (Ventas) y proveedores (Compras) (24/09).
--
-- El dueño: «para mandar mail de avisos de pagos a veces tengo más de un
-- email… tengo el de vendedor y el de administración». Hasta hoy el padrón
-- tenía UN email (y en proveedores un `contacto` y un `telefono` sueltos).
--
-- Una tabla por padrón (los dos módulos son independientes a propósito,
-- §5.18): cada contacto tiene nombre, rol, email, teléfono y el tilde
-- `recibe_avisos` — los tildados vienen marcados al mandar el aviso de pago y
-- se pueden sumar o sacar otros para ese envío.
--
-- Datos: al 24/09 hay 2 proveedores con email y ningún cliente. Los datos
-- sueltos de `pagos_proveedores` (contacto, email, teléfono) pasan a un
-- contacto «administración». Las columnas viejas (`ventas_clientes.email`,
-- `pagos_proveedores.email/contacto/telefono`) quedan en la base sin uso desde
-- la pantalla: la fuente de verdad pasa a ser la tabla de contactos.

-- ── Ventas ──────────────────────────────────────────────────────────────────
create table if not exists public.ventas_cliente_contactos (
  id            bigserial primary key,
  cliente_id    bigint not null references public.ventas_clientes(id) on delete cascade,
  nombre        text,
  rol           text not null default 'administracion',
  email         text,
  telefono      text,
  recibe_avisos boolean not null default true,
  orden         smallint not null default 0,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  constraint ventas_cliente_contactos_rol_chk check (rol in ('administracion', 'vendedor', 'compras', 'pagos', 'otro')),
  constraint ventas_cliente_contactos_algo_chk check (
    coalesce(btrim(nombre), '') <> '' or coalesce(btrim(email), '') <> '' or coalesce(btrim(telefono), '') <> ''),
  constraint ventas_cliente_contactos_email_chk check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create index if not exists ventas_cliente_contactos_cliente_idx on public.ventas_cliente_contactos (cliente_id, orden, id);
create unique index if not exists ventas_cliente_contactos_email_uidx
  on public.ventas_cliente_contactos (cliente_id, lower(email)) where email is not null;

alter table public.ventas_cliente_contactos enable row level security;
drop policy if exists ventas_cliente_contactos_all on public.ventas_cliente_contactos;
create policy ventas_cliente_contactos_all on public.ventas_cliente_contactos for all using (true) with check (true);
revoke all on table public.ventas_cliente_contactos from public, anon, authenticated;
grant all on table public.ventas_cliente_contactos to service_role;
revoke all on sequence public.ventas_cliente_contactos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ventas_cliente_contactos_id_seq to service_role;

drop trigger if exists trg_ventas_cliente_contactos_touch on public.ventas_cliente_contactos;
create trigger trg_ventas_cliente_contactos_touch before update on public.ventas_cliente_contactos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_cambios on public.ventas_cliente_contactos;
create trigger trg_audit_cambios after update on public.ventas_cliente_contactos
  for each row execute function public.audit_cambios('facturacion', 'contacto del cliente', 'id');
drop trigger if exists trg_audit_borrado on public.ventas_cliente_contactos;
create trigger trg_audit_borrado after delete on public.ventas_cliente_contactos
  for each row execute function public.audit_borrado('facturacion', 'contacto del cliente', 'id');

-- ── Compras ─────────────────────────────────────────────────────────────────
create table if not exists public.pagos_proveedor_contactos (
  id            bigserial primary key,
  proveedor_id  bigint not null references public.pagos_proveedores(id) on delete cascade,
  nombre        text,
  rol           text not null default 'administracion',
  email         text,
  telefono      text,
  recibe_avisos boolean not null default true,
  orden         smallint not null default 0,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  constraint pagos_proveedor_contactos_rol_chk check (rol in ('administracion', 'vendedor', 'compras', 'pagos', 'otro')),
  constraint pagos_proveedor_contactos_algo_chk check (
    coalesce(btrim(nombre), '') <> '' or coalesce(btrim(email), '') <> '' or coalesce(btrim(telefono), '') <> ''),
  constraint pagos_proveedor_contactos_email_chk check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create index if not exists pagos_proveedor_contactos_proveedor_idx on public.pagos_proveedor_contactos (proveedor_id, orden, id);
create unique index if not exists pagos_proveedor_contactos_email_uidx
  on public.pagos_proveedor_contactos (proveedor_id, lower(email)) where email is not null;

alter table public.pagos_proveedor_contactos enable row level security;
drop policy if exists pagos_proveedor_contactos_all on public.pagos_proveedor_contactos;
create policy pagos_proveedor_contactos_all on public.pagos_proveedor_contactos for all using (true) with check (true);
revoke all on table public.pagos_proveedor_contactos from public, anon, authenticated;
grant all on table public.pagos_proveedor_contactos to service_role;
revoke all on sequence public.pagos_proveedor_contactos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pagos_proveedor_contactos_id_seq to service_role;

drop trigger if exists trg_pagos_proveedor_contactos_touch on public.pagos_proveedor_contactos;
create trigger trg_pagos_proveedor_contactos_touch before update on public.pagos_proveedor_contactos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_cambios on public.pagos_proveedor_contactos;
create trigger trg_audit_cambios after update on public.pagos_proveedor_contactos
  for each row execute function public.audit_cambios('pagos', 'contacto del proveedor', 'id');
drop trigger if exists trg_audit_borrado on public.pagos_proveedor_contactos;
create trigger trg_audit_borrado after delete on public.pagos_proveedor_contactos
  for each row execute function public.audit_borrado('pagos', 'contacto del proveedor', 'id');

-- ── Datos: lo suelto del padrón pasa a un contacto ──────────────────────────
insert into public.ventas_cliente_contactos (cliente_id, rol, email, recibe_avisos, created_by)
select c.id, 'administracion', lower(btrim(c.email)), true, c.updated_by
  from public.ventas_clientes c
 where nullif(btrim(c.email), '') is not null
   and btrim(c.email) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
   and not exists (select 1 from public.ventas_cliente_contactos k where k.cliente_id = c.id);

insert into public.pagos_proveedor_contactos (proveedor_id, nombre, rol, email, telefono, recibe_avisos, created_by)
select p.id, nullif(btrim(p.contacto), ''), 'administracion',
       case when btrim(coalesce(p.email, '')) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(btrim(p.email)) end,
       nullif(btrim(p.telefono), ''), true, p.updated_by
  from public.pagos_proveedores p
 where (nullif(btrim(p.contacto), '') is not null or nullif(btrim(p.email), '') is not null or nullif(btrim(p.telefono), '') is not null)
   and not exists (select 1 from public.pagos_proveedor_contactos k where k.proveedor_id = p.id);
