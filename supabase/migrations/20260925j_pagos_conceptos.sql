-- =====================================================================
-- Compras: concepto de la factura de proveedor (2026-09-25)
--
-- Por qué: el contador (Leo) necesita clasificar cada compra —combustible,
-- materiales, fletes…— para el libro y los reportes, y hoy solo existe la
-- `descripcion` libre. Decisión del dueño: UN concepto por factura (la
-- descripción sigue siendo el detalle de lo comprado), de una lista que el
-- contador ajusta desde el sistema, y obligatorio al cargar.
--
-- · `pagos_conceptos`: la lista. `nombre_norm` = norm_txt(nombre), lo
--   mantiene un trigger y es UNIQUE (el backend traduce la violación de
--   `pagos_conceptos_nombre_norm_key` a CONCEPTO_DUPLICADO). Sin DELETE en
--   la API: se da de baja con `activo = false`.
-- · Solo service_role (como todo Pagos), RLS con la policy permisiva de
--   siempre, touch + auditoría ('pagos', 'concepto de compra').
-- · `pagos_facturas.concepto_id`: nullable en la TABLA (las 17 viejas se
--   completan en 20260925m); la obligatoriedad vive en la RPC de alta
--   (20260925n, después del deploy del backend). Ningún trigger de
--   congelado/desaprobación mira esta columna, a propósito: es
--   clasificación, no plata.
-- =====================================================================

create table public.pagos_conceptos (
  id          bigserial primary key,
  nombre      text not null,
  nombre_norm text not null default '',   -- norm_txt(nombre); lo mantiene trg_pagos_concepto_norm
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  constraint pagos_conceptos_nombre_chk check (length(btrim(nombre)) >= 2),
  constraint pagos_conceptos_nombre_norm_key unique (nombre_norm)
);
comment on table public.pagos_conceptos is
  'Conceptos de compra (Compras): uno por factura de proveedor. Lista editable por el contador; baja con activo=false, sin borrar.';

create or replace function public.fn_pagos_concepto_norm() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $f$
begin
  new.nombre := btrim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  new.nombre_norm := public.norm_txt(new.nombre);
  return new;
end $f$;
revoke all on function public.fn_pagos_concepto_norm() from public, anon, authenticated;

create trigger trg_pagos_concepto_norm before insert or update of nombre on public.pagos_conceptos
  for each row execute function public.fn_pagos_concepto_norm();

alter table public.pagos_conceptos enable row level security;
create policy pagos_conceptos_all on public.pagos_conceptos for all using (true) with check (true);
revoke all on table public.pagos_conceptos from public, anon, authenticated;
grant all on table public.pagos_conceptos to service_role;
revoke all on sequence public.pagos_conceptos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pagos_conceptos_id_seq to service_role;

create trigger trg_pagos_conceptos_touch before update on public.pagos_conceptos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_conceptos
  for each row execute function public.audit_cambios('pagos', 'concepto de compra', 'id');
create trigger trg_audit_borrado after delete on public.pagos_conceptos
  for each row execute function public.audit_borrado('pagos', 'concepto de compra', 'id');

-- Semilla, en el orden que propuso el dueño (el contador la ajusta después).
insert into public.pagos_conceptos (nombre, orden)
select s.nombre, s.orden
  from (values ('Combustible', 1), ('Materiales de obra', 2), ('Fletes y transporte', 3),
               ('Mantenimiento y repuestos', 4), ('Herramientas y equipos', 5), ('Limpieza e insumos', 6),
               ('Servicios', 7), ('Honorarios', 8), ('Alquileres', 9), ('Seguros', 10),
               ('Impuestos y tasas', 11), ('Otros', 12)) as s(nombre, orden);

alter table public.pagos_facturas
  add column concepto_id bigint references public.pagos_conceptos(id);
create index pagos_facturas_concepto_idx on public.pagos_facturas (concepto_id);
comment on column public.pagos_facturas.concepto_id is
  'Concepto de compra (pagos_conceptos). Editable siempre, también pagada: no desaprueba ni congela. Obligatorio en el alta desde 20260925n.';
