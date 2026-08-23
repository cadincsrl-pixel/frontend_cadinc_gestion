-- Fix audit liquidaciones pct: reabrir_liquidacion resetea también los campos pct (2026-08-23).
--
-- Bug (Fix 2 del audit de liquidación pct): la versión vigente de
-- reabrir_liquidacion (20260806_fecha_cierre_y_cobro.sql) resetea 9 montos
-- derivados al reabrir, pero OMITE los 3 campos de modalidad pct agregados en
-- 20260730b_chofer_modalidad_pct.sql: base_neta, subtotal_pct y pct_aplicado.
-- Resultado: una liquidación pct reaperta queda en borrador con total_neto = 0
-- pero con subtotal_pct / base_neta viejos > 0 — comisión fantasma sin camino
-- de corrección por API (los pct solo se escriben en create_liquidacion).
--
-- Fix: misma definición que 20260806 + reset de los 3 campos pct en el mismo
-- UPDATE. Se resetean a NULL (no a 0) porque:
--   * las 3 columnas son numeric SIN default → NULL es su estado "sin calcular"
--     (los otros 9 montos van a 0 porque sus columnas tienen default 0);
--   * la convención del modelo (comment de liquidaciones.modalidad, 20260730b)
--     es que los campos de la otra modalidad quedan NULL — una liquidación
--     km_jornal tiene los pct en NULL; un borrador reaperto vuelve a ese estado.
-- modalidad NO se toca (not null default 'km_jornal', es insumo/snapshot igual
-- que dias_trabajados / basico_dia / precio_km).
--
-- NO toca el cálculo del % sobre tarifa neta (÷1,21): eso vive en el frontend
-- (calcularBasePctViajes) y ocurre una sola vez, antes de create_liquidacion.

-- ── reabrir_liquidacion: además de km, limpia los campos pct ────────
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
  -- Los campos pct (base_neta, subtotal_pct, pct_aplicado) también son montos
  -- derivados de los viajes desligados → vuelven a NULL, su estado sin calcular
  -- (columnas sin default; en km_jornal viven en NULL). Dejarlos sería una
  -- comisión fantasma > 0 en un borrador con total_neto = 0.
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
         base_neta           = null,
         subtotal_pct        = null,
         pct_aplicado        = null,
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
  'Reabre una liquidación cerrada: desliga tramos/adelantos/estadías/gastos, borra el adelanto de saldo negativo si sigue pendiente (o falla con SALDO_NEGATIVO_YA_LIQUIDADO / SALDO_NEGATIVO_EN_BORRADOR si otra liquidación ya lo consumió) y deja los montos derivados en cero — incluidos los campos pct (base_neta, subtotal_pct, pct_aplicado → NULL).';

-- SECURITY DEFINER: solo service_role (política 20260527). CREATE OR REPLACE
-- preserva la ACL existente, pero se re-aplica igual que en 20260806/20260726b
-- para no depender de eso.
revoke all on function public.reabrir_liquidacion(integer, uuid) from public, anon, authenticated;
grant execute on function public.reabrir_liquidacion(integer, uuid) to service_role;
