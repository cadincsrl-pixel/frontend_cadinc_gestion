-- Saldo negativo de liquidación → adelanto automático.
--
-- Hasta hoy, si el total neto de una liquidación daba negativo (el chofer se
-- llevó más adelantos de los que generó en el período), esa deuda del chofer
-- hacia la empresa no quedaba registrada en ningún lado: la liquidación cerraba
-- en negativo, los adelantos quedaban consumidos y la liquidación siguiente
-- arrancaba de cero. La plata se perdía.
-- Ahora el cierre genera, en la misma transacción, un adelanto pendiente por el
-- valor absoluto del neto, que la próxima liquidación del chofer descuenta sola.

-- ── 1) adelantos.liquidacion_origen_id ────────────────────────────────────────
-- OJO con la diferencia semántica entre las dos FKs a liquidaciones:
--   liquidacion_id        → "este adelanto FUE DESCONTADO en esa liquidación".
--   liquidacion_origen_id → "este adelanto NACIÓ del cierre negativo de esa".
-- FK sin ON DELETE: el NO ACTION por defecto es a propósito, obliga a
-- eliminar_liquidacion a hacerse cargo explícitamente del adelanto huérfano.
alter table public.adelantos
  add column if not exists liquidacion_origen_id integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'adelantos_liquidacion_origen_id_fkey'
       and conrelid = 'public.adelantos'::regclass
  ) then
    alter table public.adelantos
      add constraint adelantos_liquidacion_origen_id_fkey
      foreign key (liquidacion_origen_id) references public.liquidaciones(id);
  end if;
end $$;

comment on column public.adelantos.liquidacion_origen_id is
  'Liquidación cuyo cierre en negativo generó este adelanto (deuda del chofer). Distinto de liquidacion_id, que es la liquidación donde el adelanto se descontó.';

-- ── 2) Índice único parcial = idempotencia del cierre ─────────────────────────
-- Cerrar dos veces la misma liquidación no puede generar dos deudas.
create unique index if not exists adelantos_liquidacion_origen_id_uidx
  on public.adelantos (liquidacion_origen_id)
  where liquidacion_origen_id is not null;

-- ── 3) forma_pago acepta 'saldo' ──────────────────────────────────────────────
-- Es plata que NUNCA se le entregó al chofer: mostrarla como "efectivo" sería
-- mentira en la UI (y habilitaría el recibo para firmar). Solo la crea el
-- sistema; los schemas zod del backend siguen aceptando transferencia|efectivo.
alter table public.adelantos
  drop constraint if exists adelantos_forma_pago_check;

alter table public.adelantos
  add constraint adelantos_forma_pago_check
  check (forma_pago in ('transferencia', 'efectivo', 'saldo'));

-- ── 4) cerrar_liquidacion ─────────────────────────────────────────────────────
-- Reemplaza los dos UPDATE sueltos de liquidacionesService.cerrar(): gastos y
-- estado de la liquidación se movían sin transacción, y el adelanto de saldo
-- sumaría un tercer paso que puede fallar dejando todo a medias.
create or replace function public.cerrar_liquidacion(
  p_liquidacion_id integer,
  p_user_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_liq            liquidaciones%rowtype;
  v_adelanto_id    integer;
  v_adelanto_monto numeric;
  v_fecha_cierre   date;
begin
  -- (1) Lock: serializa cierres/reaperturas concurrentes sobre la misma liq.
  select * into v_liq
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  -- (2) Gastos vinculados: 'aprobado' → 'pagado'. El chofer acaba de recibir el
  -- reintegro como parte de esta liquidación. Idempotente: si ya estaban
  -- pagados por otro camino, no se tocan.
  update gastos_logistica
     set estado     = 'pagado',
         updated_by = p_user_id
   where liquidacion_id = p_liquidacion_id
     and estado         = 'aprobado';

  -- (3) Cerrar. Cerrar una liquidación ya cerrada NO falla: el frontend hace
  -- create → cerrar en secuencia y puede reintentar.
  update liquidaciones
     set estado     = 'cerrada',
         updated_by = p_user_id
   where id = p_liquidacion_id
  returning * into v_liq;

  -- (4) Neto negativo → adelanto pendiente por la deuda.
  if v_liq.total_neto < 0 then
    -- current_date es UTC: después de las 21hs argentinas daría el día
    -- siguiente y el adelanto quedaría fechado en el futuro.
    v_fecha_cierre := (now() at time zone 'America/Argentina/Buenos_Aires')::date;

    insert into adelantos (
      chofer_id, fecha, monto, descripcion, forma_pago,
      liquidacion_origen_id, created_by, updated_by
    ) values (
      v_liq.chofer_id,
      v_fecha_cierre,
      abs(v_liq.total_neto),
      format(
        'Saldo negativo liquidación N° %s (%s → %s)',
        v_liq.id,
        coalesce(to_char(v_liq.fecha_desde, 'DD/MM/YYYY'), 's/f'),
        coalesce(to_char(v_liq.fecha_hasta, 'DD/MM/YYYY'), 's/f')
      ),
      'saldo',
      v_liq.id,
      p_user_id,
      p_user_id
    )
    on conflict (liquidacion_origen_id) where liquidacion_origen_id is not null
    do nothing
    returning id, monto into v_adelanto_id, v_adelanto_monto;

    -- El ON CONFLICT no insertó (ya existía de un cierre previo): recuperamos
    -- el existente para que el valor devuelto sea correcto igual.
    if v_adelanto_id is null then
      select id, monto
        into v_adelanto_id, v_adelanto_monto
        from adelantos
       where liquidacion_origen_id = v_liq.id;
    end if;
  end if;

  return jsonb_build_object(
    'liquidacion',          to_jsonb(v_liq),
    'adelanto_saldo_id',    v_adelanto_id,
    'adelanto_saldo_monto', v_adelanto_monto
  );
end;
$function$;

comment on function public.cerrar_liquidacion(integer, uuid) is
  'Cierra una liquidación: pasa gastos aprobado→pagado, estado→cerrada y, si total_neto < 0, crea el adelanto automático por la deuda (forma_pago=saldo). Todo en una transacción, idempotente.';

-- ── 5) reabrir_liquidacion: manejar el adelanto de saldo ──────────────────────
-- Misma definición que 20260716_estadias_choferes.sql + el bloque (1b) + el
-- reseteo de montos del UPDATE final.
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
  v_saldo_id             integer;
  v_saldo_liq_id         integer;
  v_saldo_liq_estado     text;
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

  -- (1b) Adelanto automático nacido del cierre negativo de ESTA liquidación.
  -- Si ya fue descontado en otra liquidación, reabrir ésta rompería la
  -- contabilidad de aquella: se bloquea. El estado de la consumidora define la
  -- salida que hay que ofrecerle al usuario, y son distintas: una liquidación
  -- cerrada se reabre; un borrador (queda cuando el create→cerrar encadenado
  -- falla) no se puede reabrir ni aparece en el Historial, sólo se elimina.
  -- El estado va como subconsulta y no como join para que el `for update`
  -- siga bloqueando sólo el adelanto (la consumidora no se toca acá).
  select a.id,
         a.liquidacion_id,
         (select l.estado from liquidaciones l where l.id = a.liquidacion_id)
    into v_saldo_id, v_saldo_liq_id, v_saldo_liq_estado
    from adelantos a
   where a.liquidacion_origen_id = p_liquidacion_id
   for update;

  if found then
    if v_saldo_liq_id is not null then
      if v_saldo_liq_estado = 'borrador' then
        raise exception 'SALDO_NEGATIVO_EN_BORRADOR'
          using detail = v_saldo_liq_id::text;
      end if;
      raise exception 'SALDO_NEGATIVO_YA_LIQUIDADO'
        using detail = v_saldo_liq_id::text;
    end if;
    -- Seguía pendiente: la deuda desaparece junto con el cierre que la creó.
    delete from adelantos where id = v_saldo_id;
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

  -- Reabrir desligó TODO (tramos, adelantos, estadías, gastos): la liquidación
  -- queda sin nada vinculado, así que sus montos derivados tienen que quedar en
  -- cero. Si se dejaran los viejos, volver a cerrar ese borrador desde la card
  -- de saldo por chofer (que llama a cerrar_liquidacion tal cual) generaría un
  -- SEGUNDO adelanto por el mismo saldo negativo: deuda duplicada.
  -- dias_trabajados / basico_dia / precio_km NO se tocan: son insumos que cargó
  -- el usuario, no montos calculados, y el modal de detalle recalcula con ellos.
  update liquidaciones
     set estado              = 'borrador',
         km_totales          = 0,
         subtotal_basico     = 0,
         subtotal_km         = 0,
         subtotal_km_cargado = 0,
         subtotal_km_vacio   = 0,
         total_adelantos     = 0,
         total_reintegros    = 0,
         total_estadias      = 0,
         total_neto          = 0,
         updated_by          = p_user_id
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

comment on function public.reabrir_liquidacion(integer, uuid) is
  'Reabre una liquidación cerrada: desliga tramos/adelantos/estadías/gastos, borra el adelanto de saldo negativo si sigue pendiente (o falla con SALDO_NEGATIVO_YA_LIQUIDADO / SALDO_NEGATIVO_EN_BORRADOR si otra liquidación ya lo consumió) y deja los montos derivados en cero.';

-- ── 6) eliminar_liquidacion: manejar el adelanto de saldo ─────────────────────
-- Misma definición que 20260716_estadias_choferes.sql + el bloque (1b). Acá el
-- DELETE del adelanto además es obligatorio: su FK a liquidaciones es NO ACTION
-- y bloquearía el borrado de la liquidación.
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
  v_saldo_id             integer;
  v_saldo_liq_id         integer;
  v_saldo_liq_estado     text;
begin
  perform 1 from liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  -- (1b) Adelanto automático nacido del cierre negativo de ESTA liquidación.
  -- Igual que en reabrir: si otra liquidación ya lo descontó no se puede tocar,
  -- y el estado de esa otra decide qué salida ofrecerle al usuario (reabrirla
  -- si está cerrada, eliminarla si quedó en borrador).
  select a.id,
         a.liquidacion_id,
         (select l.estado from liquidaciones l where l.id = a.liquidacion_id)
    into v_saldo_id, v_saldo_liq_id, v_saldo_liq_estado
    from adelantos a
   where a.liquidacion_origen_id = p_liquidacion_id
   for update;

  if found then
    if v_saldo_liq_id is not null then
      if v_saldo_liq_estado = 'borrador' then
        raise exception 'SALDO_NEGATIVO_EN_BORRADOR'
          using detail = v_saldo_liq_id::text;
      end if;
      raise exception 'SALDO_NEGATIVO_YA_LIQUIDADO'
        using detail = v_saldo_liq_id::text;
    end if;
    delete from adelantos where id = v_saldo_id;
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

comment on function public.eliminar_liquidacion(integer, uuid) is
  'Elimina una liquidación: desliga tramos/adelantos/estadías/gastos y borra el adelanto de saldo negativo si sigue pendiente (o falla con SALDO_NEGATIVO_YA_LIQUIDADO / SALDO_NEGATIVO_EN_BORRADOR si otra liquidación ya lo consumió). Transaccional.';

-- ── 7) Grants: solo service_role (patrón 20260527_revoke_secdef_from_public) ──
-- El backend Hono llama estas RPCs con supabaseAdmin; las validaciones de
-- permiso corren en el backend antes de la llamada.
revoke all on function public.cerrar_liquidacion(integer, uuid)   from public, anon, authenticated;
revoke all on function public.reabrir_liquidacion(integer, uuid)  from public, anon, authenticated;
revoke all on function public.eliminar_liquidacion(integer, uuid) from public, anon, authenticated;

grant execute on function public.cerrar_liquidacion(integer, uuid)   to service_role;
grant execute on function public.reabrir_liquidacion(integer, uuid)  to service_role;
grant execute on function public.eliminar_liquidacion(integer, uuid) to service_role;
