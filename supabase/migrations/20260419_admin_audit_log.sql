-- =====================================================================
-- Audit log: registro de acciones de usuarios
-- =====================================================================

create table if not exists audit_log (
  id          bigserial primary key,
  user_id     uuid references auth.users(id),
  user_nombre text,
  modulo      text not null,
  accion      text not null,
  entidad     text not null,
  entidad_id  text,
  detalle     text,
  ip          text,
  created_at  timestamptz default now()
);

create index if not exists idx_audit_log_user on audit_log(user_id);
create index if not exists idx_audit_log_modulo on audit_log(modulo);
create index if not exists idx_audit_log_created on audit_log(created_at desc);

alter table audit_log enable row level security;
create policy "audit_log_all" on audit_log for all using (true) with check (true);

-- Seed módulo admin si no existe
insert into modulos (key, nombre, descripcion, icono, activo, orden)
values ('admin', 'Administración', 'Gestión de usuarios y configuración', '⚙️', true, 0)
on conflict (key) do nothing;
