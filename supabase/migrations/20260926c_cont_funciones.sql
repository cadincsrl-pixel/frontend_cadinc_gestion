-- =====================================================================
-- Contabilidad fase 1: funciones internas (2026-09-26)
--
-- Por qué: las RPC de asientos (20260926d) y los reportes (20260926f)
-- comparten tres piezas que conviene tener en UN lugar:
--   · _cont_periodo_de(fecha): el período que contiene una fecha;
--   · _cont_asiento_json(id): la forma CtbAsiento que devuelve toda la API
--     (encabezado + líneas con nombres de cuenta, auxiliar, obra y usuarios);
--   · _cont_validar_lineas(lineas, confirmar): la única validación de líneas
--     de entrada, con `detail {indice, campo}` (índice 0-based, igual que el
--     path de zod `lineas.N.campo`) para que el backend marque el campo.
-- Sin endpoint propio: grants solo a service_role.
-- =====================================================================

create or replace function public._cont_periodo_de(p_fecha date)
returns public.cont_periodos
language sql stable set search_path = public, pg_temp as $$
  select p.* from public.cont_periodos p where p_fecha between p.desde and p.hasta
$$;

create or replace function public._cont_asiento_json(p_id bigint)
returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', a.id, 'ejercicio_id', a.ejercicio_id, 'periodo_id', a.periodo_id, 'periodo_estado', p.estado,
    'numero', a.numero, 'fecha', a.fecha, 'tipo', a.tipo, 'estado', a.estado, 'glosa', a.glosa, 'total', a.total,
    'origen_tabla', a.origen_tabla, 'origen_id', a.origen_id, 'origen_evento', a.origen_evento,
    'revierte_id', a.revierte_id, 'revierte_numero', ar.numero,
    'revertido_por_id', a.revertido_por_id, 'revertido_por_numero', arp.numero,
    'motivo_anulacion', a.motivo_anulacion, 'anulado_por', a.anulado_por, 'anulado_por_nombre', pa.nombre, 'anulado_at', a.anulado_at,
    'confirmado_por', a.confirmado_por, 'confirmado_por_nombre', pc.nombre, 'confirmado_at', a.confirmado_at,
    'created_by', a.created_by, 'created_by_nombre', pcr.nombre, 'created_at', a.created_at, 'updated_at', a.updated_at,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'orden', l.orden, 'cuenta_id', l.cuenta_id,
               'cuenta_codigo', c.codigo, 'cuenta_nombre', c.nombre,
               'debe', l.debe, 'haber', l.haber,
               'aux_tipo', case when l.aux_cliente_id is not null then 'cliente'
                                when l.aux_proveedor_id is not null then 'proveedor'
                                when l.aux_tesoreria_id is not null then 'tesoreria'
                                else c.auxiliar end,
               'aux_id', coalesce(l.aux_cliente_id, l.aux_proveedor_id, l.aux_tesoreria_id),
               'aux_nombre', coalesce(vc.razon_social, pp.razon_social, tc.nombre),
               'obra_cod', l.obra_cod, 'obra_nom', o.nom, 'glosa', l.glosa)
             order by l.orden, l.id)
        from public.cont_asiento_lineas l
        join public.cont_cuentas c on c.id = l.cuenta_id
        left join public.ventas_clientes vc on vc.id = l.aux_cliente_id
        left join public.pagos_proveedores pp on pp.id = l.aux_proveedor_id
        left join public.tesoreria_cuentas tc on tc.id = l.aux_tesoreria_id
        left join public.obras o on o.cod = l.obra_cod
       where l.asiento_id = a.id), '[]'::jsonb))
    from public.cont_asientos a
    join public.cont_periodos p on p.id = a.periodo_id
    left join public.cont_asientos ar  on ar.id  = a.revierte_id
    left join public.cont_asientos arp on arp.id = a.revertido_por_id
    left join public.profiles pa  on pa.id  = a.anulado_por
    left join public.profiles pc  on pc.id  = a.confirmado_por
    left join public.profiles pcr on pcr.id = a.created_by
   where a.id = p_id
$$;

-- Devuelve las líneas normalizadas:
--   [{cuenta_id, debe, haber, aux_cliente_id, aux_proveedor_id, aux_tesoreria_id, obra_cod, glosa}]
-- con el aux_id de la entrada ya repartido en su columna según cont_cuentas.auxiliar.
create or replace function public._cont_validar_lineas(p_lineas jsonb, p_confirmar boolean)
returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_e      jsonb;
  v_i      int;
  v_out    jsonb := '[]'::jsonb;
  v_cta    bigint;
  v_c      public.cont_cuentas%rowtype;
  v_debe   numeric;
  v_haber  numeric;
  v_aux    bigint;
  v_obra   text;
  v_ok     boolean;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'SIN_LINEAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lineas) > 500 then
    raise exception 'DEMASIADAS_LINEAS' using errcode = 'P0001', detail = json_build_object('max', 500)::text;
  end if;

  for v_e, v_i in select e, (n - 1)::int from jsonb_array_elements(p_lineas) with ordinality as t(e, n) loop
    -- Importes: redondeo a centavos y exactamente uno > 0.
    begin
      v_debe  := round(coalesce(nullif(v_e ->> 'debe', '')::numeric, 0), 2);
      v_haber := round(coalesce(nullif(v_e ->> 'haber', '')::numeric, 0), 2);
    exception when others then
      raise exception 'LINEA_IMPORTE_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'debe')::text;
    end;
    if v_debe < 0 or v_haber < 0 or v_debe >= 1e12 or v_haber >= 1e12
       or not ((v_debe > 0 and v_haber = 0) or (v_haber > 0 and v_debe = 0)) then
      raise exception 'LINEA_IMPORTE_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', case when v_debe < 0 or v_debe >= 1e12 then 'debe'
                                                                 when v_haber < 0 or v_haber >= 1e12 then 'haber'
                                                                 else 'debe' end,
                                   'debe', v_debe, 'haber', v_haber)::text;
    end if;

    -- Cuenta.
    begin
      v_cta := nullif(v_e ->> 'cuenta_id', '')::bigint;
    exception when others then v_cta := null;
    end;
    select * into v_c from public.cont_cuentas where id = v_cta;
    if not found then
      raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'cuenta_id', 'cuenta_id', v_e -> 'cuenta_id')::text;
    end if;
    if not v_c.activo then
      raise exception 'CUENTA_INACTIVA' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'cuenta_id', 'cuenta_id', v_cta, 'codigo', v_c.codigo)::text;
    end if;
    if not v_c.imputable then
      raise exception 'CUENTA_NO_IMPUTABLE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'cuenta_id', 'cuenta_id', v_cta, 'codigo', v_c.codigo)::text;
    end if;

    -- Auxiliar.
    begin
      v_aux := nullif(v_e ->> 'aux_id', '')::bigint;
    exception when others then
      raise exception 'AUXILIAR_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'aux_id')::text;
    end;
    if v_c.auxiliar = 'none' and v_aux is not null then
      raise exception 'AUXILIAR_NO_CORRESPONDE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'aux_id', 'codigo', v_c.codigo)::text;
    end if;
    if v_c.auxiliar <> 'none' and v_aux is null and p_confirmar then
      raise exception 'AUXILIAR_REQUERIDO' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'aux_id', 'auxiliar', v_c.auxiliar, 'codigo', v_c.codigo)::text;
    end if;
    if v_aux is not null then
      v_ok := case v_c.auxiliar
                when 'cliente'   then exists (select 1 from public.ventas_clientes   where id = v_aux)
                when 'proveedor' then exists (select 1 from public.pagos_proveedores where id = v_aux)
                when 'tesoreria' then exists (select 1 from public.tesoreria_cuentas where id = v_aux)
                else false end;
      if not v_ok then
        raise exception 'AUXILIAR_NO_EXISTE' using errcode = 'P0001',
          detail = json_build_object('indice', v_i, 'campo', 'aux_id', 'auxiliar', v_c.auxiliar, 'aux_id', v_aux)::text;
      end if;
    end if;

    -- Obra.
    v_obra := nullif(btrim(coalesce(v_e ->> 'obra_cod', '')), '');
    if v_obra is not null and not exists (select 1 from public.obras where cod = v_obra) then
      raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'campo', 'obra_cod', 'obra_cod', v_obra)::text;
    end if;

    v_out := v_out || jsonb_build_object(
      'cuenta_id', v_cta, 'debe', v_debe, 'haber', v_haber,
      'aux_cliente_id',   case when v_c.auxiliar = 'cliente'   then v_aux end,
      'aux_proveedor_id', case when v_c.auxiliar = 'proveedor' then v_aux end,
      'aux_tesoreria_id', case when v_c.auxiliar = 'tesoreria' then v_aux end,
      'obra_cod', v_obra,
      'glosa', left(btrim(coalesce(v_e ->> 'glosa', '')), 300));
  end loop;
  return v_out;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_periodo_de(date)',
    '_cont_asiento_json(bigint)',
    '_cont_validar_lineas(jsonb, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
