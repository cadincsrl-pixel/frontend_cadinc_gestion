-- Modalidad de pago del chofer: básico + km (lo de siempre) o % de la
-- facturación neta de sus viajes.
--
-- Pedido del dueño 2026-07-30: "tengo dos formas de pagarle: básico más km
-- recorridos, o un porcentaje del neto de facturación de los viajes que hace
-- cada uno, según arreglo con el chofer". Decisiones que fijan la matemática:
--   · El % es sobre el NETO SIN IVA (ton × tarifa neta, misma escalera que
--     facturación). El IVA nunca es base de nada.
--   · El jornal diario es OPCIONAL por chofer: se reusa basico_dia (0 = solo %).
--   · Los tramos vacíos NO pagan en esta modalidad (no facturan).
--   · Un viaje sin facturar se liquida a tarifa vigente, sin esperar la factura.
--
-- El glosario del proyecto preveía esta modalidad ('pct_jornal') desde el
-- diseño original pero nunca se construyó. Se usa 'pct' como valor.

-- ── Chofer: modalidad + % versionado ─────────────────────────────────────────
alter table public.choferes
  add column if not exists modalidad_pago text not null default 'km_jornal';

alter table public.choferes drop constraint if exists choferes_modalidad_pago_check;
alter table public.choferes
  add constraint choferes_modalidad_pago_check check (modalidad_pago in ('km_jornal', 'pct'));

-- Cache de la última versión, igual que basico_dia / precio_km_*.
alter table public.choferes
  add column if not exists pct_facturacion numeric not null default 0;

comment on column public.choferes.modalidad_pago is
  'km_jornal = básico/día + km × tarifa (default). pct = % de la facturación neta de sus viajes + jornal opcional (basico_dia, 0 = solo %).';
comment on column public.choferes.pct_facturacion is
  'Cache de la última versión de choferes_pct_hist. Para cálculos con fecha usar el historial, nunca este campo.';

-- Historial versionado del %, espejo de choferes_basico_hist (migración 20260729g).
create table if not exists public.choferes_pct_hist (
  id        serial primary key,
  chofer_id integer not null references public.choferes(id) on delete cascade,
  pct       numeric not null check (pct >= 0 and pct <= 100),
  desde     date    not null
);

alter table public.choferes_pct_hist drop constraint if exists choferes_pct_hist_uniq;
alter table public.choferes_pct_hist
  add constraint choferes_pct_hist_uniq unique (chofer_id, desde);

create index if not exists choferes_pct_hist_lookup_idx
  on public.choferes_pct_hist (chofer_id, desde desc);

comment on table public.choferes_pct_hist is
  'Versiones del % de facturación por chofer. choferes.pct_facturacion es solo cache de la última.';

alter table public.choferes_pct_hist enable row level security;
drop policy if exists auth_all on public.choferes_pct_hist;
create policy auth_all on public.choferes_pct_hist
  for all to authenticated using (true) with check (true);

-- ── set_tarifas_chofer v2: acepta el % ───────────────────────────────────────
-- Firma nueva (parámetro agregado) → drop + create + grants de nuevo.
drop function if exists public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid);

create function public.set_tarifas_chofer(
  p_chofer_id  integer,
  p_desde      date,
  p_basico_dia numeric default null,
  p_km_cargado numeric default null,
  p_km_vacio   numeric default null,
  p_user_id    uuid    default null,
  p_pct        numeric default null
)
returns choferes
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_chofer choferes%rowtype;
begin
  if p_desde is null then
    raise exception 'DESDE_REQUERIDO';
  end if;

  select * into v_chofer from choferes where id = p_chofer_id for update;
  if not found then
    raise exception 'CHOFER_NO_EXISTE';
  end if;

  if p_basico_dia is not null then
    insert into choferes_basico_hist (chofer_id, valor_dia, desde)
    values (p_chofer_id, p_basico_dia, p_desde)
    on conflict (chofer_id, desde) do update set valor_dia = excluded.valor_dia;
  end if;

  if p_km_cargado is not null then
    insert into choferes_km_hist (chofer_id, valor_km, desde, tipo)
    values (p_chofer_id, p_km_cargado, p_desde, 'cargado')
    on conflict (chofer_id, tipo, desde) do update set valor_km = excluded.valor_km;
  end if;

  if p_km_vacio is not null then
    insert into choferes_km_hist (chofer_id, valor_km, desde, tipo)
    values (p_chofer_id, p_km_vacio, p_desde, 'vacio')
    on conflict (chofer_id, tipo, desde) do update set valor_km = excluded.valor_km;
  end if;

  if p_pct is not null then
    insert into choferes_pct_hist (chofer_id, pct, desde)
    values (p_chofer_id, p_pct, p_desde)
    on conflict (chofer_id, desde) do update set pct = excluded.pct;
  end if;

  -- Refresco del cache desde el historial (versión más nueva de cada columna):
  -- una corrección retroactiva no pisa la tarifa vigente.
  update choferes ch
     set basico_dia = coalesce((
           select h.valor_dia from choferes_basico_hist h
            where h.chofer_id = p_chofer_id
            order by h.desde desc limit 1
         ), ch.basico_dia),
         precio_km_cargado = coalesce((
           select h.valor_km from choferes_km_hist h
            where h.chofer_id = p_chofer_id and h.tipo = 'cargado'
            order by h.desde desc limit 1
         ), ch.precio_km_cargado),
         precio_km_vacio = coalesce((
           select h.valor_km from choferes_km_hist h
            where h.chofer_id = p_chofer_id and h.tipo = 'vacio'
            order by h.desde desc limit 1
         ), ch.precio_km_vacio),
         pct_facturacion = coalesce((
           select h.pct from choferes_pct_hist h
            where h.chofer_id = p_chofer_id
            order by h.desde desc limit 1
         ), ch.pct_facturacion),
         updated_by = coalesce(p_user_id, ch.updated_by)
   where ch.id = p_chofer_id
  returning * into v_chofer;

  return v_chofer;
end;
$function$;

comment on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid, numeric) is
  'Versión de tarifas del chofer vigente desde una fecha: básico, $/km cargado/vacío y % de facturación. Refresca los caches en choferes.';

revoke all on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid, numeric)
  to service_role;

-- ── Liquidaciones: snapshot de la modalidad y sus componentes ────────────────
alter table public.liquidaciones
  add column if not exists modalidad     text    not null default 'km_jornal',
  add column if not exists pct_aplicado  numeric,
  add column if not exists base_neta     numeric,
  add column if not exists subtotal_pct  numeric;

alter table public.liquidaciones drop constraint if exists liquidaciones_modalidad_check;
alter table public.liquidaciones
  add constraint liquidaciones_modalidad_check check (modalidad in ('km_jornal', 'pct'));

comment on column public.liquidaciones.modalidad is
  'Snapshot de la modalidad del chofer al liquidar. En pct: subtotal_pct = base_neta × pct_aplicado/100, y los subtotales de km quedan null.';
comment on column public.liquidaciones.base_neta is
  'Solo modalidad pct: Σ (toneladas × tarifa neta sin IVA) de los viajes cargados liquidados, a tarifa vigente por la escalera de facturación.';
