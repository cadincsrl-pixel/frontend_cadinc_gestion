-- =====================================================================
-- Compras: la nota de crédito del proveedor es un COMPROBANTE (2026-09-25)
-- Parte 1 de 4: tablas y constraints.
--
-- Decisión del dueño (24/09): «las notas de crédito de proveedor se cargan
-- como comprobante con su desglose». Hasta hoy la NC era una LÍNEA de la
-- orden de pago (`pagos_orden_lineas.tipo = 'nota_credito'`, con número y
-- fecha tipeados): no tenía archivo propio, ni IVA discriminado, ni reparto
-- por obra, y el Libro IVA de compras no la veía como comprobante. Ahora es
-- una fila de `pagos_facturas` con `clase = 'nota_credito'`: se carga igual
-- que una factura (archivo primero, desglose ARCA, reparto por obra), se
-- aprueba con la misma doble firma y BAJA LA DEUDA cuando se aprueba.
--
-- Qué hace esta migración:
--   · Guarda: al 24/09 no hay ninguna línea NC ni OP «solo NC». Si aparece
--     alguna antes de aplicar, se frena acá (habría que migrarla a mano).
--   · `pagos_facturas.clase` ('factura' | 'nota_credito'), inmutable.
--   · CHECK `pagos_facturas_nc_chk`: una NC lleva código ARCA de NC (3/8/13/
--     53/203/208/213), es A/B/C, no vence, no se paga al cargar, no la paga el
--     cliente y no lleva plan de cheques. Una factura NO lleva código de NC.
--   · El índice único por número se recrea (mismo nombre) sumando `clase`: la
--     NC 0001-00000045 y la factura 0001-00000045 del mismo proveedor son
--     comprobantes distintos.
--   · `pagos_nc_aplicaciones`: qué parte de cada NC acredita a qué factura.
--     Las reglas (mismo proveedor, reservas, congelado al aprobar) viven en
--     triggers y en `_pagos_guardar_aplicaciones` (migración b).
--   · `pagos_orden_lineas_sin_nc_chk`: la OP ya no acepta líneas NC. Las
--     columnas nc_numero/nc_fecha/monto_nc quedan (en null/0) para no romper
--     lecturas viejas.
-- =====================================================================

-- ── 0) Guarda de datos ─────────────────────────────────────────────────
do $$
declare v_lineas int; v_ops int;
begin
  select count(*) into v_lineas from public.pagos_orden_lineas where tipo = 'nota_credito';
  select count(*) into v_ops from public.pagos_ordenes where forma_pago = 'nota_credito' or coalesce(monto_nc, 0) > 0;
  if v_lineas > 0 or v_ops > 0 then
    raise exception 'Hay NC viejas en órdenes de pago (líneas %, OP %): migrarlas antes', v_lineas, v_ops;
  end if;
end $$;

-- ── 1) Clase del comprobante ───────────────────────────────────────────
alter table public.pagos_facturas
  add column if not exists clase text not null default 'factura';
alter table public.pagos_facturas drop constraint if exists pagos_facturas_clase_chk;
alter table public.pagos_facturas add constraint pagos_facturas_clase_chk
  check (clase in ('factura', 'nota_credito'));
comment on column public.pagos_facturas.clase is
  'factura | nota_credito. La NC es un comprobante propio: baja la deuda al aprobarse, vía pagos_nc_aplicaciones. Inmutable. 20260925a.';

alter table public.pagos_facturas drop constraint if exists pagos_facturas_nc_chk;
alter table public.pagos_facturas add constraint pagos_facturas_nc_chk check (
  case when clase = 'nota_credito' then
         cbte_tipo_arca is not null and cbte_tipo_arca in (3, 8, 13, 53, 203, 208, 213)
     and tipo_comprobante in ('A', 'B', 'C')
     and not pagada_al_cargar and not paga_cliente
     and vence_el is null and plan_cheques is null
  else cbte_tipo_arca is null or cbte_tipo_arca not in (3, 8, 13, 53, 203, 208, 213)
  end);

-- La clase no cambia: una factura no se «convierte» en NC (anular y cargar de nuevo).
create or replace function public.fn_pagos_factura_clase_inmutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.clase is distinct from old.clase then
    raise exception 'CAMPO_NO_EDITABLE' using errcode = 'P0001',
      detail = json_build_object('campo', 'clase', 'factura_id', old.id)::text;
  end if;
  return new;
end $function$;
revoke all on function public.fn_pagos_factura_clase_inmutable() from public, anon, authenticated;

drop trigger if exists trg_pagos_factura_clase_inmutable on public.pagos_facturas;
create trigger trg_pagos_factura_clase_inmutable before update of clase on public.pagos_facturas
  for each row execute function public.fn_pagos_factura_clase_inmutable();

-- ── 2) Número único por clase (mismo nombre: lo buscan crear/editar) ────
drop index if exists public.pagos_facturas_prov_tipo_numero_uidx;
create unique index pagos_facturas_prov_tipo_numero_uidx
  on public.pagos_facturas (proveedor_id, clase, tipo_comprobante, numero_norm)
  where numero_norm is not null and tipo_comprobante in ('A', 'B', 'C') and estado <> 'anulada';

-- ── 3) Aplicaciones de NC a facturas ───────────────────────────────────
create table if not exists public.pagos_nc_aplicaciones (
  id          bigserial primary key,
  nc_id       bigint not null references public.pagos_facturas(id),
  factura_id  bigint not null references public.pagos_facturas(id),
  monto       numeric(14,2) not null check (monto > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  constraint pagos_nc_aplicaciones_unica unique (nc_id, factura_id),
  constraint pagos_nc_aplicaciones_distintas check (nc_id <> factura_id)
);
create index if not exists pagos_nc_aplicaciones_factura_idx on public.pagos_nc_aplicaciones (factura_id);
comment on table public.pagos_nc_aplicaciones is
  'Qué parte de una NC de proveedor acredita a qué factura. Con la NC sin aprobar es una RESERVA (no se puede pagar con plata); aprobada, baja la deuda. Se escribe solo por _pagos_guardar_aplicaciones. 20260925a.';

alter table public.pagos_nc_aplicaciones enable row level security;
drop policy if exists pagos_nc_aplicaciones_all on public.pagos_nc_aplicaciones;
create policy pagos_nc_aplicaciones_all on public.pagos_nc_aplicaciones for all using (true) with check (true);
revoke all on table public.pagos_nc_aplicaciones from public, anon, authenticated;
grant all on table public.pagos_nc_aplicaciones to service_role;
revoke all on sequence public.pagos_nc_aplicaciones_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pagos_nc_aplicaciones_id_seq to service_role;

drop trigger if exists trg_pagos_nc_aplicaciones_touch on public.pagos_nc_aplicaciones;
create trigger trg_pagos_nc_aplicaciones_touch before update on public.pagos_nc_aplicaciones
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_cambios on public.pagos_nc_aplicaciones;
create trigger trg_audit_cambios after update on public.pagos_nc_aplicaciones
  for each row execute function public.audit_cambios('pagos', 'aplicación de NC', 'id');
drop trigger if exists trg_audit_borrado on public.pagos_nc_aplicaciones;
create trigger trg_audit_borrado after delete on public.pagos_nc_aplicaciones
  for each row execute function public.audit_borrado('pagos', 'aplicación de NC', 'id');

-- ── 4) La OP ya no lleva NC ────────────────────────────────────────────
alter table public.pagos_orden_lineas drop constraint if exists pagos_orden_lineas_sin_nc_chk;
alter table public.pagos_orden_lineas add constraint pagos_orden_lineas_sin_nc_chk check (tipo <> 'nota_credito');
