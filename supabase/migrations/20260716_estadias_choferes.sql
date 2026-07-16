-- Estadías de choferes: días extra que el chofer pierde esperando para
-- cargar/descargar, pagados por día aparte del básico. Mismo patrón que los
-- adelantos: se registran cuando pasan (fechas + $/día + obs), quedan
-- pendientes, y al liquidar se seleccionan y SUMAN al neto.
-- Definiciones del user (2026-07-16): $/día manual cada vez (sin preset por
-- chofer), sin vínculo a tramo (fechas + obs alcanzan), solo pago al chofer.

-- ── 1) Tabla ──────────────────────────────────────────────────────────────────
create table estadias (
  id             serial primary key,
  chofer_id      integer not null references choferes(id) on delete restrict,
  fecha_desde    date not null,
  fecha_hasta    date not null,
  dias           integer not null check (dias > 0),
  monto_dia      numeric not null check (monto_dia > 0),
  total          numeric not null check (total > 0),
  obs            text,
  -- NULL = pendiente. FK sin cascade: reabrir/eliminar liquidación desliga.
  liquidacion_id integer references liquidaciones(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  check (fecha_desde <= fecha_hasta)
);

alter table estadias enable row level security;
create policy estadias_all on estadias for all using (true) with check (true);

create index estadias_chofer_idx on estadias (chofer_id, fecha_desde);
create index estadias_liq_idx on estadias (liquidacion_id) where liquidacion_id is not null;

-- ── 2) Columna en liquidaciones ───────────────────────────────────────────────
alter table liquidaciones
  add column total_estadias numeric not null default 0;

-- ── 3) RPC create: sumar estadías ─────────────────────────────────────────────
-- Mismo patrón del 20260617: drop del overload actual + create con los params
-- nuevos al final con DEFAULT → back-compat de deploy (el backend viejo sigue
-- funcionando hasta que se deployee el nuevo).
drop function if exists public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric, integer[]);

create function public.create_liquidacion_con_reintegros(
  p_chofer_id           integer,
  p_fecha_desde         date,
  p_fecha_hasta         date,
  p_dias_trabajados     integer,
  p_basico_dia          numeric,
  p_km_totales          numeric,
  p_precio_km           numeric,
  p_subtotal_basico     numeric,
  p_subtotal_km         numeric,
  p_total_adelantos     numeric,
  p_total_reintegros    numeric,
  p_total_neto          numeric,
  p_obs                 text,
  p_tramo_ids           integer[],
  p_adelanto_ids        integer[],
  p_gasto_ids           integer[],
  p_user_id             uuid,
  p_subtotal_km_cargado numeric    default null,
  p_subtotal_km_vacio   numeric    default null,
  p_tramo_chofer_ids    integer[]  default '{}',
  p_estadia_ids         integer[]  default '{}',
  p_total_estadias      numeric    default 0
)
returns liquidaciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_liq         liquidaciones;
  v_tramo_id    integer;
  v_adelanto_id integer;
  v_gasto_id    integer;
  v_tc_id       integer;
  v_estadia_id  integer;
begin
  if array_length(p_tramo_ids, 1) > 0 then
    perform 1 from tramos
    where id = any(p_tramo_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null or estado <> 'completado');
    if found then
      raise exception 'TRAMO_INVALIDO' using detail = 'Algun tramo no es valido (otro chofer / ya liquidado / no completado).';
    end if;
  end if;

  if array_length(p_tramo_chofer_ids, 1) > 0 then
    perform 1 from tramo_choferes
    where id = any(p_tramo_chofer_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'RELEVO_INVALIDO' using detail = 'Alguna fila de relevo no es valida (otro chofer / ya liquidada).';
    end if;
  end if;

  if array_length(p_adelanto_ids, 1) > 0 then
    perform 1 from adelantos
    where id = any(p_adelanto_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'ADELANTO_INVALIDO' using detail = 'Algun adelanto no es valido.';
    end if;
  end if;

  if array_length(p_gasto_ids, 1) > 0 then
    perform 1 from gastos_logistica
    where id = any(p_gasto_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null or estado <> 'aprobado' or pagado_por <> 'chofer' or deleted_at is not null);
    if found then
      raise exception 'GASTO_INVALIDO' using detail = 'Algun gasto no es valido para reintegrar.';
    end if;
  end if;

  if array_length(p_estadia_ids, 1) > 0 then
    perform 1 from estadias
    where id = any(p_estadia_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'ESTADIA_INVALIDA' using detail = 'Alguna estadia no es valida (otro chofer / ya liquidada).';
    end if;
  end if;

  insert into liquidaciones (
    chofer_id, fecha_desde, fecha_hasta, dias_trabajados,
    basico_dia, km_totales, precio_km,
    subtotal_basico, subtotal_km,
    subtotal_km_cargado, subtotal_km_vacio,
    total_adelantos, total_reintegros, total_estadias, total_neto,
    obs, estado, created_by, updated_by
  ) values (
    p_chofer_id, p_fecha_desde, p_fecha_hasta, p_dias_trabajados,
    p_basico_dia, p_km_totales, p_precio_km,
    p_subtotal_basico, p_subtotal_km,
    p_subtotal_km_cargado, p_subtotal_km_vacio,
    p_total_adelantos, p_total_reintegros, p_total_estadias, p_total_neto,
    p_obs, 'borrador', p_user_id, p_user_id
  ) returning * into v_liq;

  foreach v_tramo_id in array p_tramo_ids loop
    update tramos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tramo_id;
  end loop;

  foreach v_tc_id in array p_tramo_chofer_ids loop
    update tramo_choferes set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tc_id;
  end loop;

  foreach v_adelanto_id in array p_adelanto_ids loop
    update adelantos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_adelanto_id;
  end loop;

  foreach v_gasto_id in array p_gasto_ids loop
    update gastos_logistica set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_gasto_id;
  end loop;

  foreach v_estadia_id in array p_estadia_ids loop
    update estadias set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_estadia_id;
  end loop;

  return v_liq;
end
$function$;

-- Grants: solo service_role (patrón 20260527 — el backend llama con supabaseAdmin).
revoke all on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric, integer[], integer[], numeric
) from public, anon, authenticated;

grant execute on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric, integer[], integer[], numeric
) to service_role;

-- ── 4) reabrir / eliminar: desligar también estadías ─────────────────────────
create or replace function public.reabrir_liquidacion(p_liquidacion_id integer, p_user_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado_actual text;
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
begin
  select estado into v_estado_actual
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  if v_estado_actual = 'borrador' then
    raise exception 'LIQUIDACION_YA_EN_BORRADOR';
  end if;

  update tramos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_tramos_desligados = row_count;

  update tramo_choferes
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update adelantos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_adelantos_desligados = row_count;

  update estadias
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update gastos_logistica
     set estado         = 'aprobado',
         liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_gastos_revertidos = row_count;

  update liquidaciones
     set estado     = 'borrador',
         updated_by = p_user_id
   where id = p_liquidacion_id;

  return jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
end;
$function$;

create or replace function public.eliminar_liquidacion(p_liquidacion_id integer, p_user_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
begin
  perform 1 from liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  update tramos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_tramos_desligados = row_count;

  update tramo_choferes
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update adelantos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_adelantos_desligados = row_count;

  -- Desligar estadías ANTES del DELETE (FK sin cascade lo bloquearía).
  update estadias
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update gastos_logistica
     set estado         = 'aprobado',
         liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_gastos_revertidos = row_count;

  delete from liquidaciones where id = p_liquidacion_id;

  return jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
end;
$function$;
