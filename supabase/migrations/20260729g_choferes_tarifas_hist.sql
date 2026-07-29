-- Versionado de las tarifas de chofer: básico/día y $/km cargado y vacío.
--
-- El problema: `handleGuardarTarifas` hacía UPDATE in-place sobre
-- `choferes.basico_dia / precio_km_cargado / precio_km_vacio`. Como el "parcial"
-- de Gastos > Reportes (el trabajo hecho pero todavía sin liquidar) valúa con la
-- tarifa ACTUAL, el día de un aumento se re-valuaba retroactivamente todo el
-- trabajo pendiente. Con un 20% se movían $1.168.584 solos.
--
-- Es exactamente el bug de tarja del 2026-06-26: un aumento global por UPDATE
-- in-place recalculó los costos de todas las semanas ya pagadas y los valores
-- históricos hubo que recuperarlos por extrapolación de un Excel. Acá se corta
-- antes de que pase, copiando el modelo que quedó ahí:
-- `categoria_tarifas (cat_id, vh, desde)` + `getVHGlobalEnFecha()`, con
-- `categorias.vh` degradado a cache de la última versión.
--
-- Las liquidaciones YA CERRADAS no están en riesgo: snapshotean basico_dia y los
-- subtotales, y el prorrateo del reporte usa esos montos pagados, no la tarifa
-- del chofer. El agujero es sólo el trabajo pendiente de liquidar.
--
-- Las dos tablas ya existían de un diseño anterior, vacías y sin nadie que las
-- leyera ni las escribiera. Se les agrega lo que faltaba y se las rellena.

-- ── Integridad ──────────────────────────────────────────────────────────────
-- Una sola tarifa por chofer y fecha de vigencia. Sin esto, dos filas con el
-- mismo `desde` hacen que el valor devuelto dependa del orden de lectura.
-- Idempotente: `choferes_km_hist_tipo_check` ya venía del diseño anterior, y
-- `add constraint` no acepta IF NOT EXISTS.
alter table public.choferes_basico_hist drop constraint if exists choferes_basico_hist_uniq;
alter table public.choferes_basico_hist
  add  constraint choferes_basico_hist_uniq unique (chofer_id, desde);

alter table public.choferes_km_hist drop constraint if exists choferes_km_hist_uniq;
alter table public.choferes_km_hist
  add  constraint choferes_km_hist_uniq unique (chofer_id, tipo, desde);

alter table public.choferes_km_hist drop constraint if exists choferes_km_hist_tipo_check;
alter table public.choferes_km_hist
  add  constraint choferes_km_hist_tipo_check check (tipo in ('cargado', 'vacio'));

alter table public.choferes_basico_hist drop constraint if exists choferes_basico_hist_valor_check;
alter table public.choferes_basico_hist
  add  constraint choferes_basico_hist_valor_check check (valor_dia >= 0);

alter table public.choferes_km_hist drop constraint if exists choferes_km_hist_valor_check;
alter table public.choferes_km_hist
  add  constraint choferes_km_hist_valor_check check (valor_km >= 0);

create index if not exists choferes_basico_hist_lookup_idx
  on public.choferes_basico_hist (chofer_id, desde desc);

create index if not exists choferes_km_hist_lookup_idx
  on public.choferes_km_hist (chofer_id, tipo, desde desc);

comment on table public.choferes_basico_hist is
  'Versiones del básico/día por chofer. choferes.basico_dia es sólo cache de la última. Para cualquier cálculo con fecha usar la función de lookup, NUNCA la columna cacheada.';
comment on table public.choferes_km_hist is
  'Versiones del $/km por chofer y tipo (cargado/vacio). choferes.precio_km_* es sólo cache de la última.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Verificado antes de escribir: las tarifas NUNCA cambiaron desde abril 2026.
-- Los 11 subtotales de liquidaciones cerradas dividen EXACTO por la tarifa
-- actual del chofer, cargado y vacío (incluido Alderete, cuyo $/km vacío es 150
-- contra los 130 del resto — es real y consistente en toda su liquidación, no un
-- error de carga). O sea que una sola versión por chofer reproduce al peso toda
-- la historia pagada.
--
-- `desde` = el primer día del que hay registro de trabajo de ese chofer, y si no
-- tiene ninguno, la fecha en que se lo cargó. No se inventa una fecha anterior:
-- la función de lookup cae a la versión más vieja cuando la fecha consultada es
-- previa a todo, así que nada queda sin tarifa.
insert into public.choferes_basico_hist (chofer_id, valor_dia, desde)
select ch.id,
       coalesce(ch.basico_dia, 0),
       coalesce(
         least(
           (select min(l.fecha_desde) from liquidaciones l where l.chofer_id = ch.id),
           (select min(coalesce(t.fecha_descarga, t.fecha_vacio, t.fecha_carga))
              from tramos t where t.chofer_id = ch.id)
         ),
         ch.created_at::date
       )
  from public.choferes ch
 where coalesce(ch.basico_dia, 0) > 0
on conflict (chofer_id, desde) do nothing;

insert into public.choferes_km_hist (chofer_id, valor_km, desde, tipo)
select ch.id, v.valor, d.desde, v.tipo
  from public.choferes ch
 cross join lateral (
   -- least() ignora los NULL, así que sirve aunque el chofer tenga tramos y no
   -- liquidaciones (o al revés).
   select coalesce(
     least(
       (select min(l.fecha_desde) from liquidaciones l where l.chofer_id = ch.id),
       (select min(coalesce(tr.fecha_descarga, tr.fecha_vacio, tr.fecha_carga))
          from tramos tr where tr.chofer_id = ch.id)
     ),
     ch.created_at::date
   ) as desde
 ) as d
 cross join lateral (
   values (coalesce(ch.precio_km_cargado, 0), 'cargado'),
          (coalesce(ch.precio_km_vacio,   0), 'vacio')
 ) as v(valor, tipo)
 where v.valor > 0
on conflict (chofer_id, tipo, desde) do nothing;

-- ── Escritura versionada ────────────────────────────────────────────────────
-- Reemplaza el UPDATE in-place. Inserta (o corrige) la versión que arranca en
-- `p_desde` y refresca el cache de `choferes` SÓLO si esa versión es la más
-- nueva: así una corrección retroactiva no pisa la tarifa vigente.
create or replace function public.set_tarifas_chofer(
  p_chofer_id  integer,
  p_desde      date,
  p_basico_dia numeric      default null,
  p_km_cargado numeric      default null,
  p_km_vacio   numeric      default null,
  p_user_id    uuid         default null
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

  -- Refresco del cache: cada columna toma el valor de SU versión más nueva.
  -- Se recalcula desde el historial en lugar de asignar los parámetros, así el
  -- cache queda consistente incluso cuando se cargó una versión retroactiva.
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
         updated_by = coalesce(p_user_id, ch.updated_by)
   where ch.id = p_chofer_id
  returning * into v_chofer;

  return v_chofer;
end;
$function$;

comment on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid) is
  'Guarda una versión de las tarifas del chofer vigente desde una fecha y refresca el cache en choferes. Reemplaza el UPDATE in-place que re-valuaba retroactivamente el trabajo sin liquidar.';

revoke all on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.set_tarifas_chofer(integer, date, numeric, numeric, numeric, uuid)
  to service_role;

alter table public.choferes_basico_hist enable row level security;
alter table public.choferes_km_hist     enable row level security;

-- RLS permisiva como el resto del esquema: la autorización real está en el
-- backend Hono. Ver CLAUDE.md §5.4.
drop policy if exists auth_all on public.choferes_basico_hist;
create policy auth_all on public.choferes_basico_hist
  for all to authenticated using (true) with check (true);

drop policy if exists auth_all on public.choferes_km_hist;
create policy auth_all on public.choferes_km_hist
  for all to authenticated using (true) with check (true);
