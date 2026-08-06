-- Fecha de cierre de liquidaciones y fecha de cobro de facturas (2026-08-06).
--
-- Pedido de Franco: "cuando cobro viajes o pago a choferes, ¿me aparece la
-- fecha?" — no aparecía NI se guardaba. El cierre solo tocaba updated_at (que
-- se pisa con cualquier edición) y la fecha de cobro se anotaba como texto en
-- obs ("Cobrado el DD/MM/YYYY") porque no había columna.
--
-- 1. liquidaciones.cerrada_en (timestamptz): la setea cerrar_liquidacion,
--    la limpia reabrir_liquidacion.
-- 2. cobros.cobrado_en (date): la setea el backend al confirmar pago (con la
--    fecha real que ya pedía el modal), la limpia revertir.
-- 3. Backfill: cierres desde audit_log donde hay registro (acción 'cerrar'
--    existe desde el 2026-07-31); el resto con updated_at como aproximación.
--    Cobros: parseando la nota "Cobrado el DD/MM/YYYY" de obs; sin nota,
--    updated_at::date.

alter table liquidaciones add column if not exists cerrada_en timestamptz;
alter table cobros        add column if not exists cobrado_en date;

comment on column liquidaciones.cerrada_en is
  'Cuándo se cerró (RPC cerrar_liquidacion). NULL en borradores; reabrir la limpia. Backfill 2026-08-06: audit_log si había registro, si no updated_at (aproximación).';
comment on column cobros.cobrado_en is
  'Fecha real del cobro (la carga el usuario al confirmar pago). Backfill 2026-08-06: nota "Cobrado el" de obs, si no updated_at::date (aproximación).';

-- ── Backfill liquidaciones ──────────────────────────────────────────
-- Con registro de auditoría (cierres desde 2026-07-31): fecha exacta.
update liquidaciones l
   set cerrada_en = a.ts
  from (
    select entidad_id::int as liq_id, max(created_at) as ts
      from audit_log
     where accion = 'cerrar' and entidad = 'liquidación' and entidad_id ~ '^\d+$'
     group by entidad_id
  ) a
 where l.id = a.liq_id
   and l.estado in ('cerrada', 'anulada')
   and l.cerrada_en is null;

-- Resto de cerradas/anuladas: updated_at como mejor aproximación disponible.
update liquidaciones
   set cerrada_en = updated_at
 where estado in ('cerrada', 'anulada')
   and cerrada_en is null;

-- ── Backfill cobros ─────────────────────────────────────────────────
-- Con nota "Cobrado el DD/MM/YYYY" en obs: fecha exacta que cargó el usuario.
update cobros
   set cobrado_en = to_date(substring(obs from 'Cobrado el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
 where estado = 'cobrado'
   and cobrado_en is null
   and obs ~ 'Cobrado el \d{2}/\d{2}/\d{4}';

update cobros
   set cobrado_en = updated_at::date
 where estado = 'cobrado'
   and cobrado_en is null;

-- ── cerrar_liquidacion: setea cerrada_en ────────────────────────────
create or replace function public.cerrar_liquidacion(p_liquidacion_id integer, p_user_id uuid default null::uuid)
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
  v_tiene_algo     boolean;
begin
  select * into v_liq
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  -- Candado de contenido: sin ningún hijo esto no es una liquidación, es una
  -- cáscara. Cerrarla ensucia los reportes con plata que no existe.
  -- "Nada" y no "sin tramos": hay un caso legítimo de liquidación sin viajes
  -- que sólo tiene adelantos y una estadía.
  select exists (select 1 from tramos           where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from tramo_choferes   where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from adelantos        where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from gastos_logistica where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from estadias         where liquidacion_id = p_liquidacion_id)
    into v_tiene_algo;

  if not v_tiene_algo then
    raise exception 'LIQUIDACION_VACIA';
  end if;

  update gastos_logistica
     set estado     = 'pagado',
         updated_by = p_user_id
   where liquidacion_id = p_liquidacion_id
     and estado         = 'aprobado';

  update liquidaciones
     set estado     = 'cerrada',
         cerrada_en = now(),
         updated_by = p_user_id
   where id = p_liquidacion_id
  returning * into v_liq;

  if v_liq.total_neto < 0 then
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

-- ── reabrir_liquidacion: limpia cerrada_en ──────────────────────────
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
         cerrada_en          = null,
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

-- Las SECURITY DEFINER quedan solo para service_role (política 20260527).
revoke execute on function public.cerrar_liquidacion(integer, uuid) from public, anon, authenticated;
revoke execute on function public.reabrir_liquidacion(integer, uuid) from public, anon, authenticated;
