-- 20260906s — Roles editables y una sola fuente de verdad (fase 4 de permisos).
--
-- Hasta hoy las plantillas vivían en el código del frontend (plantillas.ts:
-- 5 presets) y cambiar una era un deploy; `tipo_usuario` duplicaba a
-- `rol_base`; y `modulos[]` lo mandaba la pantalla (gatea páginas y el
-- selector) mientras el backend leía `permisos` (caso vivo: "Bot WhatsApp"
-- figuraba "Sin acceso" y podía crear pedidos).
--
-- Modelo nuevo:
--   * `roles`: plantilla editable desde Admin › Plantillas (permisos, tabs,
--     flags, alcance por defecto, rol_base = identidad que usa el backend).
--   * `profiles.rol_key` + `profiles.personalizado`. `profiles.permisos`
--     sigue siendo LO EFECTIVO (lo que leen las 355 guardias): al elegir un
--     rol se copia; `aplicar_rol()` lo vuelve a copiar a los usuarios del
--     rol que no tengan ajustes propios.
--   * `modulos[]` se deriva de `permisos` (módulos con lectura) con
--     `modulos_de_permisos()`; la pantalla ya no lo manda.
--   * `ropa`, `prestamos` y `configuracion` dejan de ser módulos: ningún
--     endpoint los exigía; son tabs de tarja.

create table if not exists public.roles (
  key                 text primary key check (key ~ '^[a-z0-9_]+$'),
  label               text not null,
  descripcion         text not null default '',
  permisos            jsonb not null default '{}'::jsonb,
  obras_scope_default text not null default 'todas' check (obras_scope_default in ('todas', 'asignadas')),
  rol_base            text check (rol_base in ('administrativo', 'compras', 'deposito', 'jefe_obra', 'capataz')),
  orden               int  not null default 0,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
comment on table public.roles is 'Plantillas de permisos editables desde Admin › Plantillas. profiles.permisos es lo efectivo; aplicar_rol() lo copia a los usuarios del rol sin ajustes propios.';
alter table public.roles enable row level security;
revoke all on table public.roles from anon, authenticated;

insert into public.roles (key, label, descripcion, permisos, obras_scope_default, rol_base, orden) values
('administrativo', 'Administrativo',
 'Gestión amplia: tarja, logística, compras y stock, caja, flota. Casi-admin sin permisos de usuarios/permisos.',
 '{"tarja": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true, "ver_costos": true, "ver_pii": true, "administrar_obras": true},
   "logistica": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true},
   "caja": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true},
   "flota": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true},
   "certificaciones": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true, "resolver_items": true, "forzar_despacho": true, "aprobar_ajustes_stock": true}}'::jsonb,
 'todas', 'administrativo', 1),
('compras', 'Compras',
 'Solo Compras y Stock (todas las tabs). Resuelve compras y despachos.',
 '{"certificaciones": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true, "tabs": ["solicitudes", "stock", "catalogo", "stock-proveedor", "stock-cliente", "cuenta-corriente"], "resolver_items": true, "forzar_despacho": true}}'::jsonb,
 'todas', 'compras', 2),
('deposito', 'Encargado de depósito',
 'Stock interno + stock en proveedores + herramientas. Resuelve despachos. Ve solicitudes en lectura.',
 '{"certificaciones": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false, "tabs": ["stock", "catalogo", "stock-proveedor", "solicitudes"], "resolver_items": true, "forzar_despacho": true},
   "herramientas": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false, "tabs": ["inventario", "movimientos", "trazabilidad", "salidas", "retornos", "catalogo"]}}'::jsonb,
 'todas', 'deposito', 3),
('jefe_obra', 'Jefe de obra',
 'Crea y gestiona pedidos (solicitudes) de SUS obras. Agrega y edita trabajadores en tarja. Sin costos ni datos personales.',
 '{"certificaciones": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": true, "tabs": ["solicitudes"]},
   "tarja": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false, "tabs": ["tarja"], "ver_costos": false, "ver_pii": false}}'::jsonb,
 'asignadas', 'jefe_obra', 4),
('capataz', 'Capataz',
 'Carga horas de la semana actual de SU obra. Sin costos ni datos sensibles.',
 '{"tarja": {"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false, "tabs": ["tarja"], "ver_costos": false, "ver_pii": false}}'::jsonb,
 'asignadas', 'capataz', 5)
on conflict (key) do nothing;

-- Cambios de un rol quedan en audit_log (trigger genérico de 20260906l).
drop trigger if exists trg_audit_cambios on public.roles;
create trigger trg_audit_cambios after update on public.roles
  for each row execute function public.audit_cambios('usuarios', 'rol', 'key');

-- Perfiles: rol elegido y si tiene ajustes propios.
alter table public.profiles add column if not exists rol_key text references public.roles(key) on update cascade on delete set null;
alter table public.profiles add column if not exists personalizado boolean not null default false;

-- Módulos fantasma fuera de los perfiles (son tabs de tarja).
update public.profiles
   set permisos = permisos - 'ropa' - 'prestamos' - 'configuracion'
 where permisos ?| array['ropa', 'prestamos', 'configuracion'];
update public.profiles
   set modulos = array_remove(array_remove(array_remove(modulos, 'ropa'), 'prestamos'), 'configuracion')
 where modulos && array['ropa', 'prestamos', 'configuracion'];

-- Capataces sin la clave ver_pii explícita (rodolfo): igual que los demás.
update public.profiles
   set permisos = jsonb_set(permisos, '{tarja,ver_pii}', 'false'::jsonb)
 where rol_base = 'capataz' and permisos ? 'tarja' and not (permisos -> 'tarja') ? 'ver_pii';

-- Backfill: rol_key = rol_base; personalizado si no hay rol o si los permisos
-- efectivos difieren de la plantilla (protege ajustes hechos a mano, como
-- las tabs de herramientas de Cristian Sosa).
update public.profiles p
   set rol_key = p.rol_base
 where p.rol_base is not null and exists (select 1 from public.roles r where r.key = p.rol_base);
update public.profiles p
   set personalizado = (p.rol = 'operador') and (
         p.rol_key is null
         or p.permisos is distinct from (select r.permisos from public.roles r where r.key = p.rol_key)
       );

-- Módulos derivados de permisos: los que tienen lectura.
create or replace function public.modulos_de_permisos(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
    from jsonb_each(coalesce(p, '{}'::jsonb)) e(k, v)
   where (v ->> 'lectura')::boolean is true
$$;

-- Aplicar un rol a sus usuarios sin ajustes propios. La llama el backend
-- (service_role) desde POST /api/usuarios/roles/:key/aplicar; deja historial.
create or replace function public.aplicar_rol(p_key text, p_user_id uuid)
returns table (id uuid, nombre text)
language plpgsql as $$
declare
  v_permisos jsonb;
begin
  select r.permisos into v_permisos from public.roles r where r.key = p_key and r.activo;
  if not found then
    raise exception 'ROL_NO_EXISTE';
  end if;
  return query
  with afectados as (
    select p.id, p.nombre, p.permisos as antes, p.modulos as modulos_antes
      from public.profiles p
     where p.rol_key = p_key and not p.personalizado and p.rol = 'operador'
  ), upd as (
    update public.profiles p
       set permisos = v_permisos,
           modulos  = public.modulos_de_permisos(v_permisos)
      from afectados a
     where p.id = a.id
    returning p.id, p.nombre, a.antes, a.modulos_antes, p.permisos as despues, p.modulos as modulos_despues
  ), hist as (
    insert into public.profiles_permisos_history (profile_id, changed_by, permisos_old, permisos_new, modulos_old, modulos_new)
    select u.id, p_user_id, u.antes, u.despues, u.modulos_antes, u.modulos_despues
      from upd u
     where u.antes is distinct from u.despues
    returning profile_id
  )
  select u.id, u.nombre from upd u;
end $$;

revoke all on function public.aplicar_rol(text, uuid) from public, anon, authenticated;
grant execute on function public.aplicar_rol(text, uuid) to service_role;
revoke all on function public.modulos_de_permisos(jsonb) from public, anon, authenticated;
grant execute on function public.modulos_de_permisos(jsonb) to service_role;
