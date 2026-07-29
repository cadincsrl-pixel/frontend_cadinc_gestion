-- Candado: no se puede cerrar una liquidación que no tiene NADA vinculado.
--
-- Causa raíz de las cáscaras huérfanas del 2026-07-26 (liq 23 de Gonzalez y 25
-- de Zelarayan): se cerró un borrador vacío y quedó una fila 'cerrada' con los
-- subtotales intactos y cero hijos. Gastos > Reportes las sumaba de nuevo →
-- $10.538.550 de mano de obra fantasma en julio.
--
-- El test es "no tiene NADA", no "no tiene tramos". Hay un caso legítimo y
-- documentado de liquidación sin un solo viaje: chofer que sólo tiene adelantos
-- y una estadía (ver src/__tests__/liquidacion-math.test.ts, caso verificado
-- e2e el 2026-07-16 → neto −$900.000). Exigir tramos rompería eso.
--
-- Los adjuntos NO cuentan como contenido: adjuntar un PDF no convierte un
-- borrador vacío en trabajo liquidable.
--
-- Se mantiene la idempotencia de cerrar una liquidación YA cerrada que sí tiene
-- contenido: el frontend hace create → cerrar en secuencia y puede reintentar.

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
  v_tiene_algo     boolean;
begin
  -- (1) Lock: serializa cierres/reaperturas concurrentes sobre la misma liq.
  select * into v_liq
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  -- (2) Candado de contenido. Si no hay ni un viaje, ni una pata de relevo, ni
  -- un adelanto, ni un gasto, ni una estadía, esto no es una liquidación: es
  -- una cáscara. Cerrarla ensucia los reportes con plata que no existe.
  select exists (select 1 from tramos          where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from tramo_choferes  where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from adelantos       where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from gastos_logistica where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from estadias        where liquidacion_id = p_liquidacion_id)
    into v_tiene_algo;

  if not v_tiene_algo then
    raise exception 'LIQUIDACION_VACIA';
  end if;

  -- (3) Gastos vinculados: 'aprobado' → 'pagado'. El chofer acaba de recibir el
  -- reintegro como parte de esta liquidación. Idempotente: si ya estaban
  -- pagados por otro camino, no se tocan.
  update gastos_logistica
     set estado     = 'pagado',
         updated_by = p_user_id
   where liquidacion_id = p_liquidacion_id
     and estado         = 'aprobado';

  -- (4) Cerrar. Cerrar una liquidación ya cerrada NO falla: el frontend hace
  -- create → cerrar en secuencia y puede reintentar.
  update liquidaciones
     set estado     = 'cerrada',
         updated_by = p_user_id
   where id = p_liquidacion_id
  returning * into v_liq;

  -- (5) Neto negativo → adelanto pendiente por la deuda.
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
  'Cierra una liquidación: pasa sus gastos aprobados a pagados y, si el neto es negativo, genera el adelanto de saldo. Rechaza con LIQUIDACION_VACIA si no tiene ningún viaje, relevo, adelanto, gasto ni estadía vinculado.';
