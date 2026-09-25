-- =====================================================================
-- 20260929k — Deshacer una importación de «Mis Comprobantes» (2026-09-25)
--
-- Tanda 6, ítem 9, parte B (spec «configuración del ERP desde la pantalla»
-- §3.10). La spec lo reservaba como 20260929i; esa letra la tomaron los
-- avisos de pago.
--
-- 1) `pagos_importaciones` suma `deshecha_at`, `deshecha_por` y
--    `motivo_deshacer` (juntos o ninguno: CHECK pi_deshecha_chk), y el
--    trigger de auditoría de UPDATE (hasta hoy solo tenía el de DELETE).
--
-- 2) `pagos_deshacer_importacion(p_importacion_id, p_motivo, p_user_id,
--    p_aplicar default false)`: con p_aplicar=false es VISTA PREVIA (no
--    escribe ni bloquea); con true, TODO O NADA.
--    Guardas: USUARIO_REQUERIDO, SIN_PERMISO (flag pagos.importar_comprobantes,
--    el mismo que pide importar), IMPORTACION_NO_EXISTE,
--    IMPORTACION_YA_DESHECHA y, al aplicar, MOTIVO_REQUERIDO (< 3 caracteres).
--    Bloqueos por factura no anulada (una fila por factura y motivo):
--      con_pago                 línea en una OP `emitida`
--      con_nc                   en pagos_nc_aplicaciones (como factura o como
--                               NC) con la otra punta no anulada
--      imputada                 not sin_imputar
--      aprobada                 aprobada_at is not null
--      asiento_periodo_cerrado  asiento vigente del motor en un período cerrado
--    Con algún bloqueo y p_aplicar → IMPORTACION_CON_MOVIMIENTOS
--    { importacion_id, bloqueos }.
--    Aplicar hace lo mismo que `pagos_anular_factura` pero en bloque (con
--    `cadinc.pagos_recalc`): estado anulada, motivo «Importación #N
--    deshecha: …», anulado_por/at, baja de adjuntos; y marca la importación.
--    Los proveedores que creó la importación NO se tocan. Después de
--    deshacer se puede volver a importar el archivo: el chequeo de
--    duplicados y `pagos_facturas_prov_tipo_numero_uidx` excluyen las anuladas.
--
-- 3) ASIENTOS en períodos abiertos: se anulan EN LA MISMA TRANSACCIÓN, con el
--    propio motor: por cada factura con asiento vigente se corre
--    `_cont_aplicar(_cont_prop_compra(id), p_user_id, false)`. Como la
--    factura ya está anulada la propuesta viene `vigente=false` y el motor
--    hace exactamente lo que haría el próximo «Contabilizar»: en período
--    abierto marca el asiento `anulado` con «Origen anulado» (mismo UPDATE
--    que el camino de desglose_a_revisar de 20260928d). Se eligió esto y no
--    dejarlo para la próxima corrida para que Contabilidad no quede ni un
--    minuto con asientos de facturas que ya no existen (y para que la vista
--    previa diga la verdad: `asientos_a_anular` es lo que efectivamente se
--    anula). Los asientos en períodos cerrados no llegan acá: son bloqueo.
--    No pide permisos de Contabilidad: es consecuencia de anular el origen,
--    igual que anular una factura a mano y correr el motor.
--
-- Devuelve { importacion:{id, archivo, created_at, historica, filas}, total,
-- a_anular, ya_anuladas, asientos_a_anular, bloqueos:[{factura_id, numero,
-- tipo_comprobante, proveedor, motivo}], puede, aplicado }.
-- =====================================================================

-- ── 1) Marca en la importación ──────────────────────────────────────────
alter table public.pagos_importaciones
  add column deshecha_at     timestamptz,
  add column deshecha_por    uuid,
  add column motivo_deshacer text,
  add constraint pi_deshecha_chk check (
    (deshecha_at is null) = (motivo_deshacer is null) and (deshecha_at is null) = (deshecha_por is null));

comment on column public.pagos_importaciones.deshecha_at is
  'Cuándo se deshizo (pagos_deshacer_importacion, 20260929k): sus facturas quedaron anuladas. No hay «rehacer»: se reimporta el archivo.';

create trigger trg_audit_cambios after update on public.pagos_importaciones
  for each row execute function public.audit_cambios('pagos', 'importación ARCA', 'id');

-- ── 2) La RPC ───────────────────────────────────────────────────────────
create or replace function public.pagos_deshacer_importacion(
  p_importacion_id bigint,
  p_motivo         text,
  p_user_id        uuid,
  p_aplicar        boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_imp      public.pagos_importaciones%rowtype;
  v_aplicar  boolean := coalesce(p_aplicar, false);
  v_motivo   text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  v_total    int;
  v_ya       int;
  v_a        int;
  v_asientos int;
  v_bloq     jsonb;
  v_ids      bigint[];
  v_id       bigint;
  v_r        jsonb;
  v_anul     int := 0;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_flag(p_user_id, 'importar_comprobantes', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'importar_comprobantes')::text;
  end if;

  if v_aplicar then
    select * into v_imp from public.pagos_importaciones where id = p_importacion_id for update;
  else
    select * into v_imp from public.pagos_importaciones where id = p_importacion_id;
  end if;
  if not found then
    raise exception 'IMPORTACION_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('importacion_id', p_importacion_id)::text;
  end if;
  if v_imp.deshecha_at is not null then
    raise exception 'IMPORTACION_YA_DESHECHA' using errcode = 'P0001',
      detail = json_build_object('importacion_id', p_importacion_id, 'deshecha_at', v_imp.deshecha_at)::text;
  end if;
  if v_aplicar and length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  if v_aplicar and length(v_motivo) > 500 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo', 'max', 500)::text;
  end if;

  if v_aplicar then
    perform 1 from public.pagos_facturas where importacion_id = p_importacion_id order by id for update;
  end if;

  select count(*), count(*) filter (where estado = 'anulada')
    into v_total, v_ya
    from public.pagos_facturas where importacion_id = p_importacion_id;
  v_a := v_total - v_ya;

  -- Bloqueos: una fila por factura y motivo.
  with f as (
    select f.id, f.numero, f.tipo_comprobante, f.clase, f.sin_imputar, f.aprobada_at, pr.razon_social
      from public.pagos_facturas f
      left join public.pagos_proveedores pr on pr.id = f.proveedor_id
     where f.importacion_id = p_importacion_id and f.estado <> 'anulada'
  ), b as (
    select f.*, 'con_pago'::text as motivo, 1 as ord from f
     where exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
                    where l.factura_id = f.id and o.estado = 'emitida')
    union all
    select f.*, 'con_nc', 2 from f
     where exists (select 1 from public.pagos_nc_aplicaciones a
                     join public.pagos_facturas otra on otra.id = case when a.factura_id = f.id then a.nc_id else a.factura_id end
                    where (a.factura_id = f.id or a.nc_id = f.id) and otra.estado <> 'anulada')
    union all
    select f.*, 'imputada', 3 from f where not f.sin_imputar
    union all
    select f.*, 'aprobada', 4 from f where f.aprobada_at is not null
    union all
    select f.*, 'asiento_periodo_cerrado', 5 from f
     where exists (select 1 from public.cont_asientos a join public.cont_periodos p on p.id = a.periodo_id
                    where a.origen_tabla = 'pagos_facturas' and a.origen_id = f.id and a.origen_evento = 'registro'
                      and a.estado <> 'anulado' and a.revertido_por_id is null and a.revierte_id is null
                      and p.estado = 'cerrado')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'factura_id', b.id, 'numero', b.numero, 'tipo_comprobante', b.tipo_comprobante,
           'proveedor', b.razon_social, 'motivo', b.motivo) order by b.id, b.ord), '[]'::jsonb)
    into v_bloq
    from b;

  -- Asientos vigentes en períodos abiertos: los que se anulan.
  select array_agg(distinct f.id order by f.id), count(distinct a.id)
    into v_ids, v_asientos
    from public.pagos_facturas f
    join public.cont_asientos a on a.origen_tabla = 'pagos_facturas' and a.origen_id = f.id and a.origen_evento = 'registro'
                               and a.estado <> 'anulado' and a.revertido_por_id is null and a.revierte_id is null
    join public.cont_periodos p on p.id = a.periodo_id and p.estado = 'abierto'
   where f.importacion_id = p_importacion_id and f.estado <> 'anulada';
  v_asientos := coalesce(v_asientos, 0);

  if v_aplicar and jsonb_array_length(v_bloq) > 0 then
    raise exception 'IMPORTACION_CON_MOVIMIENTOS' using errcode = 'P0001',
      detail = json_build_object('importacion_id', p_importacion_id, 'bloqueos', v_bloq)::text;
  end if;

  if v_aplicar then
    -- Como pagos_anular_factura, en bloque.
    perform set_config('cadinc.pagos_recalc', 'on', true);
    update public.pagos_facturas
       set estado = 'anulada',
           motivo_anulacion = 'Importación #' || p_importacion_id || ' deshecha: ' || v_motivo,
           anulado_por = p_user_id, anulado_at = now(),
           aprobada_por = null, aprobada_at = null, updated_by = p_user_id
     where importacion_id = p_importacion_id and estado <> 'anulada';
    perform set_config('cadinc.pagos_recalc', 'off', true);

    update public.pagos_facturas_adjuntos a
       set deleted_at = now(), updated_by = p_user_id
      from public.pagos_facturas f
     where f.id = a.factura_id and f.importacion_id = p_importacion_id
       and a.deleted_at is null;

    -- Asientos: el motor, con la factura ya anulada (ver encabezado).
    if v_ids is not null then
      foreach v_id in array v_ids loop
        v_r := public._cont_aplicar(public._cont_prop_compra(v_id), p_user_id, false);
        if v_r ->> 'accion' = 'anulado' then v_anul := v_anul + 1; end if;
      end loop;
      perform set_config('cadinc.cont_rpc', 'off', true);
      if v_anul <> v_asientos then
        raise exception 'ASIENTOS_NO_ANULADOS' using errcode = 'P0001',
          detail = json_build_object('esperados', v_asientos, 'anulados', v_anul)::text;
      end if;
    end if;

    update public.pagos_importaciones
       set deshecha_at = now(), deshecha_por = p_user_id, motivo_deshacer = v_motivo
     where id = p_importacion_id;
  end if;

  return jsonb_build_object(
    'importacion', jsonb_build_object('id', v_imp.id, 'archivo', v_imp.archivo, 'created_at', v_imp.created_at,
                                      'historica', v_imp.historica, 'filas', v_imp.filas),
    'total', v_total,
    'a_anular', v_a,
    'ya_anuladas', v_ya,
    'asientos_a_anular', v_asientos,
    'bloqueos', v_bloq,
    'puede', jsonb_array_length(v_bloq) = 0,
    'aplicado', v_aplicar);
end $$;

comment on function public.pagos_deshacer_importacion(bigint, text, uuid, boolean) is
  'Deshace una importación de «Mis Comprobantes»: anula sus facturas y los asientos del motor en períodos abiertos. p_aplicar=false = vista previa. Todo o nada: con bloqueos (con_pago, con_nc, imputada, aprobada, asiento_periodo_cerrado) → IMPORTACION_CON_MOVIMIENTOS. Flag pagos.importar_comprobantes. 20260929k.';

revoke all on function public.pagos_deshacer_importacion(bigint, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.pagos_deshacer_importacion(bigint, text, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
