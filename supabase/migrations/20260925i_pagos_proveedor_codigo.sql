-- =====================================================================
-- Compras: código automático del proveedor (2026-09-25)
--
-- Por qué: el dueño y el contador (Leo) quieren identificar a cada proveedor
-- del padrón de Compras con un código corto, como en Finnegans. Decisión del
-- dueño: AUTOMÁTICO y fijo. Formato `PRV-0001` (4 dígitos; pasa a 5 solo si
-- algún día hay más de 9.999, nunca se trunca).
--
-- · Secuencia propia `pagos_proveedor_codigo_seq` y default de la columna
--   vía `pagos_proveedor_codigo_siguiente()`: el backend inserta como hoy,
--   sin mandar el código.
-- · Backfill de los que ya existen por orden de `id` → PRV-0001… y la
--   secuencia queda en el siguiente. El backfill NO bumpea `updated_at` ni
--   deja 18 renglones de auditoría: apaga el touch y `audit_cambios` solo
--   durante ese UPDATE (es un alta de dato, no una edición de nadie).
-- · No editable: trigger BEFORE UPDATE OF codigo → `CODIGO_NO_EDITABLE`,
--   salvo `set local cadinc.descongelar = 'on'` (mismo escape que el resto).
-- · Las vistas suman el código en la migración de vistas (20260925l).
-- =====================================================================

create sequence if not exists public.pagos_proveedor_codigo_seq as bigint;
revoke all on sequence public.pagos_proveedor_codigo_seq from public, anon, authenticated;
grant usage, select on sequence public.pagos_proveedor_codigo_seq to service_role;

create or replace function public.pagos_proveedor_codigo_siguiente() returns text
  language sql volatile
  set search_path = public, pg_temp
as $f$
  select 'PRV-' || lpad(s.n::text, greatest(4, length(s.n::text)), '0')
    from (select nextval('public.pagos_proveedor_codigo_seq') as n) s
$f$;
revoke all on function public.pagos_proveedor_codigo_siguiente() from public, anon, authenticated;
grant execute on function public.pagos_proveedor_codigo_siguiente() to service_role;

alter table public.pagos_proveedores add column codigo text;

alter table public.pagos_proveedores disable trigger trg_pagos_proveedores_touch;
alter table public.pagos_proveedores disable trigger trg_audit_cambios;
do $b$
declare
  v_n bigint;
begin
  update public.pagos_proveedores p
     set codigo = 'PRV-' || lpad(s.n::text, greatest(4, length(s.n::text)), '0')
    from (select id, row_number() over (order by id) as n from public.pagos_proveedores) s
   where s.id = p.id;
  select count(*) into v_n from public.pagos_proveedores;
  perform setval('public.pagos_proveedor_codigo_seq', greatest(v_n, 1), v_n > 0);
end $b$;
alter table public.pagos_proveedores enable trigger trg_pagos_proveedores_touch;
alter table public.pagos_proveedores enable trigger trg_audit_cambios;

alter table public.pagos_proveedores
  alter column codigo set default public.pagos_proveedor_codigo_siguiente(),
  alter column codigo set not null,
  add constraint pagos_proveedores_codigo_key unique (codigo),
  add constraint pagos_proveedores_codigo_formato_chk check (codigo ~ '^PRV-[0-9]{4,}$');
comment on column public.pagos_proveedores.codigo is
  'Código automático PRV-0001… (secuencia pagos_proveedor_codigo_seq). No editable: trigger trg_pagos_proveedor_codigo_fijo.';

create or replace function public.fn_pagos_proveedor_codigo_fijo() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $f$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.codigo is distinct from old.codigo then
    raise exception 'CODIGO_NO_EDITABLE' using errcode = 'P0001',
      detail = json_build_object('campo', 'codigo', 'proveedor_id', old.id, 'codigo', old.codigo)::text;
  end if;
  return new;
end $f$;
revoke all on function public.fn_pagos_proveedor_codigo_fijo() from public, anon, authenticated;

create trigger trg_pagos_proveedor_codigo_fijo before update of codigo on public.pagos_proveedores
  for each row execute function public.fn_pagos_proveedor_codigo_fijo();
