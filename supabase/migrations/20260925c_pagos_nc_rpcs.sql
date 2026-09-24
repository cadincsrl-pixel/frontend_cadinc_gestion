-- =====================================================================
-- Compras: la NC del proveedor como comprobante (2026-09-25)
-- Parte 3 de 4: las RPC.
--
-- Ninguna firma cambia (el backend de producción sigue llamando igual):
--   · pagos_crear_factura: `p_factura.clase` ('factura' | 'nota_credito';
--     si no viene se deduce de `cbte_tipo_arca`) y `p_factura.aplica_a`
--     ([{factura_id, monto}], solo NC). Una NC sin código ARCA toma el de su
--     letra (A→3, B→8, C→13). Una NC no se paga al cargar (NC_NO_SE_PAGA), no
--     vence, no la paga el cliente y no lleva plan de cheques
--     (NC_TIPO_INVALIDO {campo}). FACTURA_DUPLICADA busca dentro de la clase.
--   · pagos_editar_factura: `clase` no se edita (CAMPO_NO_EDITABLE);
--     `p_cambios.aplica_a` reemplaza las aplicaciones solo si la NC está
--     pendiente u observada (NC_APLICACION_CONGELADA si no). Una factura con
--     NC encima no cambia de proveedor ni pasa a «la paga el cliente»
--     (FACTURA_CON_NC), y su total no puede quedar por debajo de lo pagado,
--     acreditado y reservado (NC_SUPERA_SALDO). El total de una NC no puede
--     quedar por debajo de lo que ya aplica (NC_SUPERA_TOTAL).
--   · pagos_aprobar_factura: misma doble firma. Aprobar una NC revalida que
--     sus reservas quepan en cada factura (NC_SUPERA_SALDO) y después se
--     recalcula el estado (la factura puede quedar pagada por la NC).
--   · pagos_anular_factura: una factura con NC vigente encima no se anula
--     (FACTURA_CON_NC: primero anular o corregir la NC). Anular una NC sí se
--     puede aunque esté aplicada: la deuda vuelve a las facturas.
--   · pagos_aplicar_nc (NUEVA): aplica el crédito sobrante de una NC aprobada
--     a otras facturas del mismo proveedor, a mano (decisión del dueño: no
--     hay aplicación automática).
--   · pagos_devolucion_proveedor: se retira. La devolución del proveedor se
--     carga ahora como NC (crédito a favor o aplicada a otra factura) y la OP
--     original no se toca.
-- =====================================================================

-- ── 1) Crear ───────────────────────────────────────────────────────────
create or replace function public.pagos_crear_factura(p_factura jsonb, p_imputaciones jsonb, p_user_id uuid, p_orden jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prov        public.pagos_proveedores%rowtype;
  v_f           public.pagos_facturas%rowtype;
  v_id          bigint;
  v_orden_id    bigint;
  v_numero      text;
  v_numero_norm text;
  v_fecha       date;
  v_vence       date;
  v_total       numeric(14,2);
  v_paga_cli    boolean;
  v_pac         boolean := false;
  v_forma       text;
  v_constraint  text;
  v_existente   bigint;
  v_tipo        text;
  v_cbte        smallint;
  v_clase       text;
  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_prov from public.pagos_proveedores where id = (p_factura ->> 'proveedor_id')::bigint;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_factura ->> 'proveedor_id')::text;
  end if;
  if not v_prov.activo then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_prov.id)::text;
  end if;
  v_numero := nullif(btrim(coalesce(p_factura ->> 'numero', '')), '');
  v_numero_norm := case when v_numero is null then null
                        else coalesce(nullif(btrim(coalesce(p_factura ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end;
  v_fecha := (p_factura ->> 'fecha')::date;
  if v_fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  v_total := (p_factura ->> 'total')::numeric;
  if v_total is null or v_total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', p_factura ->> 'total')::text;
  end if;
  v_vence := (p_factura ->> 'vence_el')::date;
  if v_vence is not null and v_vence < v_fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'vence_el', v_vence)::text;
  end if;
  if length(btrim(coalesce(p_factura ->> 'descripcion', ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
  v_paga_cli := coalesce((p_factura ->> 'paga_cliente')::boolean, false);

  -- Clase: la que venga, o la del código ARCA.
  v_tipo := p_factura ->> 'tipo_comprobante';
  v_cbte := (p_factura ->> 'cbte_tipo_arca')::smallint;
  v_clase := coalesce(nullif(btrim(coalesce(p_factura ->> 'clase', '')), ''),
                      case when v_cbte = any(v_cod_nc) then 'nota_credito' else 'factura' end);
  if v_clase not in ('factura', 'nota_credito') then
    raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'clase', 'clase', v_clase)::text;
  end if;
  if v_clase = 'nota_credito' then
    if p_orden is not null and jsonb_typeof(p_orden) = 'object' then
      raise exception 'NC_NO_SE_PAGA' using errcode = 'P0001', detail = json_build_object('campo', 'orden')::text;
    end if;
    if coalesce(v_tipo, '') not in ('A', 'B', 'C') then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'tipo_comprobante', 'tipo_comprobante', v_tipo)::text;
    end if;
    if v_cbte is null then
      v_cbte := case v_tipo when 'A' then 3 when 'B' then 8 else 13 end;
    elsif not (v_cbte = any(v_cod_nc)) then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cbte_tipo_arca', 'cbte_tipo_arca', v_cbte)::text;
    end if;
    if v_paga_cli then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'paga_cliente')::text;
    end if;
    if v_vence is not null then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'vence_el')::text;
    end if;
    if nullif(p_factura -> 'plan_cheques', 'null'::jsonb) is not null then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'plan_cheques')::text;
    end if;
  else
    if v_cbte = any(v_cod_nc) then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cbte_tipo_arca', 'cbte_tipo_arca', v_cbte)::text;
    end if;
    if jsonb_typeof(p_factura -> 'aplica_a') = 'array' and jsonb_array_length(p_factura -> 'aplica_a') > 0 then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
    end if;
  end if;

  if p_orden is not null and jsonb_typeof(p_orden) = 'object' then
    if v_paga_cli then
      raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001';
    end if;
    v_forma := nullif(btrim(p_orden ->> 'forma_pago'), '');
    if not public._pagos_es_admin(p_user_id) and coalesce(v_forma, '') not in ('tarjeta', 'efectivo') then
      raise exception 'PAGADA_AL_CARGAR_FORMA' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
    end if;
    v_pac := true;
    v_vence := null;          -- una pagada no vence
  end if;

  begin
    insert into public.pagos_facturas (proveedor_id, tipo_comprobante, numero, numero_norm, fecha, vence_el, neto, iva, percepciones, otros, total,
                                       forma_pago_prevista, paga_cliente, pagada_al_cargar, descripcion, obs, created_by, updated_by, plan_cheques,
                                       no_gravado, exento, cae, cae_vto, cbte_tipo_arca, lectura_estado, lectura_json, clase)
    values (v_prov.id, v_tipo, v_numero, v_numero_norm, v_fecha, v_vence,
            (p_factura ->> 'neto')::numeric, (p_factura ->> 'iva')::numeric, (p_factura ->> 'percepciones')::numeric, (p_factura ->> 'otros')::numeric, v_total,
            coalesce(nullif(p_factura ->> 'forma_pago_prevista', ''), 'transferencia'), v_paga_cli, v_pac,
            btrim(p_factura ->> 'descripcion'), coalesce(p_factura ->> 'obs', ''), p_user_id, p_user_id, nullif(p_factura -> 'plan_cheques', 'null'::jsonb),
            (p_factura ->> 'no_gravado')::numeric, (p_factura ->> 'exento')::numeric,
            nullif(btrim(coalesce(p_factura ->> 'cae', '')), ''), (p_factura ->> 'cae_vto')::date,
            v_cbte,
            coalesce(nullif(p_factura ->> 'lectura_estado', ''), 'manual'),
            nullif(p_factura -> 'lectura_json', 'null'::jsonb),
            v_clase)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
      select id into v_existente from public.pagos_facturas
       where proveedor_id = v_prov.id and clase = v_clase and tipo_comprobante = v_tipo
         and numero_norm = v_numero_norm and estado <> 'anulada' limit 1;
      raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
    end if;
    raise;
  end;

  -- El detalle ANTES de la OP: con la OP la factura queda pagada y congelada.
  perform public._pagos_guardar_desglose(v_id, nullif(p_factura -> 'iva_detalle', 'null'::jsonb), nullif(p_factura -> 'tributos', 'null'::jsonb));
  select * into v_f from public.pagos_facturas where id = v_id;
  perform public._pagos_validar_desglose(v_f.neto, v_f.iva, v_f.percepciones, v_f.otros, v_f.total, v_f.no_gravado, v_f.exento);

  perform public._pagos_reemplazar_imputaciones(v_id, p_imputaciones, p_user_id);

  if v_clase = 'nota_credito' then
    perform public._pagos_guardar_aplicaciones(v_id, nullif(p_factura -> 'aplica_a', 'null'::jsonb), p_user_id, false);
  end if;

  if v_pac then
    v_orden_id := public._pagos_emitir_orden(
      v_prov.id, p_orden,
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', v_id, 'monto', v_total)),
      coalesce(p_orden -> 'adjuntos', p_orden -> 'comprobante'),
      p_user_id, false);
  end if;

  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = v_id),
    'orden',   case when v_orden_id is null then null else (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_orden_id) end);
end $function$;
revoke all on function public.pagos_crear_factura(jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pagos_crear_factura(jsonb, jsonb, uuid, jsonb) to service_role;

-- ── 2) Editar ──────────────────────────────────────────────────────────
create or replace function public.pagos_editar_factura(p_factura_id bigint, p_cambios jsonb, p_imputaciones jsonb, p_motivo text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f           public.pagos_facturas%rowtype;
  v_new         public.pagos_facturas%rowtype;
  v_cambios     jsonb := coalesce(p_cambios, '{}'::jsonb);
  v_iva_det     jsonb;
  v_trib_det    jsonb;
  v_aplica      jsonb;
  v_hay_aplica  boolean;
  v_tiene_nc    boolean;
  v_estado_antes text;
  v_tiene_pagos boolean;
  v_k           text;
  v_sets        text[] := '{}';
  v_congelados  text[] := '{}';
  v_numero      text;
  v_constraint  text;
  v_existente   bigint;
  v_suma        numeric(14,2);
  v_n           int;
  v_saldo       numeric(14,2);
  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
  v_permitidos  text[] := array['proveedor_id','tipo_comprobante','numero','numero_norm','fecha','vence_el','neto','iva',
                                'percepciones','otros','total','forma_pago_prevista','paga_cliente','descripcion','obs','plan_cheques',
                                'no_gravado','exento','cae','cae_vto','cbte_tipo_arca'];
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  -- La factura/NC y lo que tiene enganchado, en orden de id.
  perform 1 from public.pagos_facturas
   where id = p_factura_id
      or id in (select a.factura_id from public.pagos_nc_aplicaciones a where a.nc_id = p_factura_id)
   order by id for update;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  v_estado_antes := v_f.estado;
  select exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
                  where l.factura_id = p_factura_id and o.estado = 'emitida') into v_tiene_pagos;
  select exists (select 1 from public.pagos_nc_aplicaciones a join public.pagos_facturas n on n.id = a.nc_id
                  where (a.factura_id = p_factura_id or a.nc_id = p_factura_id) and n.estado <> 'anulada') into v_tiene_nc;

  -- El detalle y las aplicaciones no son columnas: se sacan y van por su puerta.
  v_iva_det  := nullif(v_cambios -> 'iva_detalle', 'null'::jsonb);
  v_trib_det := nullif(v_cambios -> 'tributos', 'null'::jsonb);
  v_hay_aplica := v_cambios ? 'aplica_a';
  v_aplica   := nullif(v_cambios -> 'aplica_a', 'null'::jsonb);
  v_cambios  := v_cambios - 'iva_detalle' - 'tributos' - 'aplica_a';

  for v_k in select jsonb_object_keys(v_cambios) loop
    if v_k <> all(v_permitidos) then
      raise exception 'CAMPO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;
  if v_hay_aplica then
    if v_f.clase <> 'nota_credito' then
      raise exception 'CAMPO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
    end if;
    if v_f.aprobada_at is not null or v_f.estado not in ('pendiente', 'observada') then
      raise exception 'NC_APLICACION_CONGELADA' using errcode = 'P0001',
        detail = json_build_object('nc_id', p_factura_id, 'estado', v_f.estado)::text;
    end if;
  end if;
  if v_cambios ? 'numero' then
    v_numero := nullif(btrim(coalesce(v_cambios ->> 'numero', '')), '');
    v_cambios := v_cambios || jsonb_build_object(
      'numero', v_numero,
      'numero_norm', case when v_numero is null then null
                          else coalesce(nullif(btrim(coalesce(v_cambios ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end);
  else
    v_cambios := v_cambios - 'numero_norm';
  end if;

  v_new := jsonb_populate_record(v_f, v_cambios);   -- fila fusionada (lo ausente queda como estaba)

  -- Reglas de la clase, con los mismos códigos que el alta.
  if v_f.clase = 'nota_credito' then
    if coalesce(v_new.tipo_comprobante, '') not in ('A', 'B', 'C') then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'tipo_comprobante', 'tipo_comprobante', v_new.tipo_comprobante)::text;
    end if;
    if v_new.cbte_tipo_arca is null or not (v_new.cbte_tipo_arca = any(v_cod_nc)) then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cbte_tipo_arca', 'cbte_tipo_arca', v_new.cbte_tipo_arca)::text;
    end if;
    if v_new.paga_cliente then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'paga_cliente')::text;
    end if;
    if v_new.vence_el is not null then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'vence_el')::text;
    end if;
    if v_new.plan_cheques is not null then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'plan_cheques')::text;
    end if;
  elsif v_new.cbte_tipo_arca = any(v_cod_nc) then
    raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cbte_tipo_arca', 'cbte_tipo_arca', v_new.cbte_tipo_arca)::text;
  end if;
  if v_tiene_nc then
    if v_new.proveedor_id is distinct from v_f.proveedor_id then v_congelados := array_append(v_congelados, 'proveedor_id'); end if;
    if v_new.paga_cliente is distinct from v_f.paga_cliente then v_congelados := array_append(v_congelados, 'paga_cliente'); end if;
    if array_length(v_congelados, 1) > 0 then
      raise exception 'FACTURA_CON_NC' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'campos', to_json(v_congelados))::text;
    end if;
  end if;

  if v_cambios ? 'proveedor_id' and v_new.proveedor_id is distinct from v_f.proveedor_id then
    if not exists (select 1 from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
    if not (select activo from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
  end if;
  if v_tiene_pagos then
    if v_new.proveedor_id is distinct from v_f.proveedor_id then v_congelados := array_append(v_congelados, 'proveedor_id'); end if;
    if v_new.fecha is distinct from v_f.fecha then v_congelados := array_append(v_congelados, 'fecha'); end if;
    if v_new.neto is distinct from v_f.neto then v_congelados := array_append(v_congelados, 'neto'); end if;
    if v_new.iva is distinct from v_f.iva then v_congelados := array_append(v_congelados, 'iva'); end if;
    if v_new.percepciones is distinct from v_f.percepciones then v_congelados := array_append(v_congelados, 'percepciones'); end if;
    if v_new.otros is distinct from v_f.otros then v_congelados := array_append(v_congelados, 'otros'); end if;
    if v_new.no_gravado is distinct from v_f.no_gravado then v_congelados := array_append(v_congelados, 'no_gravado'); end if;
    if v_new.exento is distinct from v_f.exento then v_congelados := array_append(v_congelados, 'exento'); end if;
    if v_new.total is distinct from v_f.total then v_congelados := array_append(v_congelados, 'total'); end if;
    if v_new.paga_cliente is distinct from v_f.paga_cliente then v_congelados := array_append(v_congelados, 'paga_cliente'); end if;
    -- El detalle igual al guardado no es un cambio (la pantalla manda todo).
    if v_iva_det is not null and public._pagos_iva_canon(v_iva_det) = public._pagos_iva_canon(
         (select jsonb_agg(to_jsonb(x)) from public.pagos_factura_iva x where x.factura_id = p_factura_id)) then
      v_iva_det := null;
    end if;
    if v_trib_det is not null and public._pagos_trib_canon(v_trib_det) = public._pagos_trib_canon(
         (select jsonb_agg(to_jsonb(x)) from public.pagos_factura_tributos x where x.factura_id = p_factura_id)) then
      v_trib_det := null;
    end if;
    if v_iva_det is not null or v_trib_det is not null then
      v_congelados := array_append(v_congelados, 'desglose');
    end if;
    if array_length(v_congelados, 1) > 0 then
      raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'campos', to_json(v_congelados))::text;
    end if;
  end if;
  if v_new.fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_new.fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'hoy', public.hoy_ar())::text;
  end if;
  if v_new.total is null or v_new.total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', v_new.total)::text;
  end if;
  if v_new.vence_el is not null and v_new.vence_el < v_new.fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'vence_el', v_new.vence_el)::text;
  end if;
  if length(btrim(coalesce(v_new.descripcion, ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_cambios) = 'object' and (select count(*) from jsonb_object_keys(v_cambios)) > 0 then
    for v_k in select jsonb_object_keys(v_cambios) loop
      v_sets := v_sets || format('%I = ($2).%I', v_k, v_k);
    end loop;
    begin
      execute format('update public.pagos_facturas set %s, updated_by = $3 where id = $1', array_to_string(v_sets, ', '))
        using p_factura_id, v_new, p_user_id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
        select id into v_existente from public.pagos_facturas
         where proveedor_id = v_new.proveedor_id and clase = v_f.clase and tipo_comprobante = v_new.tipo_comprobante
           and numero_norm = v_new.numero_norm and estado <> 'anulada' and id <> p_factura_id limit 1;
        raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
      end if;
      raise;
    end;
  end if;

  if v_iva_det is not null or v_trib_det is not null then
    perform public._pagos_guardar_desglose(p_factura_id, v_iva_det, v_trib_det);
  end if;
  select * into v_new from public.pagos_facturas where id = p_factura_id;
  perform public._pagos_validar_desglose(v_new.neto, v_new.iva, v_new.percepciones, v_new.otros, v_new.total, v_new.no_gravado, v_new.exento);

  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    if v_estado_antes in ('pagada', 'pagada_parcial') and length(btrim(coalesce(p_motivo, ''))) < 3 then
      raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
    end if;
    perform public._pagos_reemplazar_imputaciones(p_factura_id, p_imputaciones, p_user_id);
    if length(btrim(coalesce(p_motivo, ''))) >= 3 then
      update public.pagos_facturas
         set obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — reimputada: ' || btrim(p_motivo)), updated_by = p_user_id
       where id = p_factura_id;
    end if;
  else
    -- Cambió imputable y no vino reparto: una sola obra se ajusta sola; varias → hay que reimputar.
    select coalesce(sum(monto), 0), count(*) into v_suma, v_n from public.pagos_imputaciones where factura_id = p_factura_id;
    select imputable into v_new.imputable from public.pagos_facturas where id = p_factura_id;
    if abs(v_suma - v_new.imputable) > 0.01 then
      if v_n = 1 then
        update public.pagos_imputaciones set monto = v_new.imputable, updated_by = p_user_id where factura_id = p_factura_id;
      else
        raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
          detail = json_build_object('suma', v_suma, 'imputable', v_new.imputable)::text;
      end if;
    end if;
  end if;

  -- Aplicaciones (NC sin aprobar) y los topes que el total nuevo tiene que respetar.
  if v_hay_aplica then
    perform public._pagos_guardar_aplicaciones(p_factura_id, v_aplica, p_user_id, false);
  end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id;
  if v_f.clase = 'nota_credito' then
    select coalesce(sum(monto), 0) into v_suma from public.pagos_nc_aplicaciones where nc_id = p_factura_id;
    if v_suma > v_f.total + 0.001 then
      raise exception 'NC_SUPERA_TOTAL' using errcode = 'P0001',
        detail = json_build_object('nc_id', p_factura_id, 'total', v_f.total, 'aplicado', v_suma)::text;
    end if;
  else
    v_saldo := public._pagos_saldo_factura(p_factura_id, true);
    if v_saldo < -0.001 then
      raise exception 'NC_SUPERA_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'saldo_pagable', v_saldo, 'total', v_f.total)::text;
    end if;
  end if;

  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id),
    'aprobacion_retirada', (v_estado_antes = 'aprobada' and v_f.estado = 'pendiente'));
end $function$;
revoke all on function public.pagos_editar_factura(bigint, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.pagos_editar_factura(bigint, jsonb, jsonb, text, uuid) to service_role;

-- ── 3) Aprobar ─────────────────────────────────────────────────────────
create or replace function public.pagos_aprobar_factura(p_factura_id bigint, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f        public.pagos_facturas%rowtype;
  v_d        public.pagos_facturas%rowtype;
  v_es_admin boolean;
  v_activo   boolean;
  v_saldo    numeric(14,2);
  r          record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_es_admin := public._pagos_es_admin(p_user_id);
  -- La NC y las facturas que acredita, en orden de id (una factura: sólo ella).
  perform 1 from public.pagos_facturas
   where id = p_factura_id
      or id in (select a.factura_id from public.pagos_nc_aplicaciones a where a.nc_id = p_factura_id)
   order by id for update;
  select * into v_f from public.pagos_facturas where id = p_factura_id;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select activo into v_activo from public.pagos_proveedores where id = v_f.proveedor_id;
  if not coalesce(v_activo, false) then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_f.proveedor_id)::text;
  end if;
  -- 20260921f: la doble firma cede ante `aprobar_propias`. Lo que NO cede es
  -- NO_PUEDE_PAGAR_PROPIA ni NO_PUEDE_PAGAR_LO_QUE_APROBO en _pagos_emitir_orden.
  if not v_es_admin and v_f.created_by = p_user_id
     and not public._pagos_flag(p_user_id, 'aprobar_propias', false) then
    raise exception 'NO_PUEDE_APROBAR_PROPIA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;

  -- Una NC que se aprueba convierte sus reservas en crédito: tienen que seguir cabiendo.
  if v_f.clase = 'nota_credito' and v_f.estado = 'pendiente' then
    for r in select a.factura_id, a.monto from public.pagos_nc_aplicaciones a where a.nc_id = p_factura_id order by a.factura_id loop
      select * into v_d from public.pagos_facturas where id = r.factura_id;
      if v_d.estado = 'anulada' or v_d.paga_cliente or v_d.clase <> 'factura' then
        raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
          detail = json_build_object('factura_id', r.factura_id, 'estado', v_d.estado, 'clase', v_d.clase, 'paga_cliente', v_d.paga_cliente)::text;
      end if;
      v_saldo := public._pagos_saldo_factura(r.factura_id, true);
      if v_saldo < -0.001 then
        raise exception 'NC_SUPERA_SALDO' using errcode = 'P0001',
          detail = json_build_object('factura_id', r.factura_id, 'saldo_pagable', v_saldo + r.monto, 'monto', r.monto)::text;
      end if;
    end loop;
  end if;

  if v_f.estado = 'pendiente' then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set estado = 'aprobada', aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  elsif v_f.estado = 'pagada' and v_f.pagada_al_cargar and v_f.aprobada_at is null then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  else
    raise exception 'FACTURA_NO_APROBABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  -- Factura: puede quedar pagada por una NC ya aprobada. NC: aplicada / en parte / crédito
  -- disponible (las facturas que acredita las recalcula trg_pagos_nc_vigencia).
  perform public._pagos_recalcular_estado(p_factura_id);
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $function$;
revoke all on function public.pagos_aprobar_factura(bigint, uuid) from public, anon, authenticated;
grant execute on function public.pagos_aprobar_factura(bigint, uuid) to service_role;

-- ── 4) Anular ──────────────────────────────────────────────────────────
create or replace function public.pagos_anular_factura(p_factura_id bigint, p_motivo text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f   public.pagos_facturas%rowtype;
  v_ncs bigint[];
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  perform 1 from public.pagos_facturas
   where id = p_factura_id
      or id in (select a.factura_id from public.pagos_nc_aplicaciones a where a.nc_id = p_factura_id)
   order by id for update;
  select * into v_f from public.pagos_facturas where id = p_factura_id;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
              where l.factura_id = p_factura_id and o.estado = 'emitida') then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.clase = 'factura' then
    select array_agg(a.nc_id order by a.nc_id) into v_ncs
      from public.pagos_nc_aplicaciones a join public.pagos_facturas n on n.id = a.nc_id
     where a.factura_id = p_factura_id and n.estado <> 'anulada';
    if v_ncs is not null then
      raise exception 'FACTURA_CON_NC' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'nc_ids', to_json(v_ncs))::text;
    end if;
  end if;
  -- Una NC aplicada está en pagada / pagada_parcial: salir de ahí es cosa del recalculador.
  perform set_config('cadinc.pagos_recalc', 'on', true);
  update public.pagos_facturas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo), anulado_por = p_user_id, anulado_at = now(),
         aprobada_por = null, aprobada_at = null, updated_by = p_user_id
   where id = p_factura_id;
  perform set_config('cadinc.pagos_recalc', 'off', true);
  update public.pagos_facturas_adjuntos set deleted_at = now(), updated_by = p_user_id
   where factura_id = p_factura_id and deleted_at is null;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $function$;
revoke all on function public.pagos_anular_factura(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.pagos_anular_factura(bigint, text, uuid) to service_role;

-- ── 5) Aplicar el crédito sobrante de una NC aprobada ──────────────────
create or replace function public.pagos_aplicar_nc(p_nc_id bigint, p_aplica_a jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nc    public.pagos_facturas%rowtype;
  v_disp  numeric(14,2);
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if p_aplica_a is null or jsonb_typeof(p_aplica_a) <> 'array' or jsonb_array_length(p_aplica_a) = 0
     or exists (select 1 from jsonb_array_elements(p_aplica_a) e
                 where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'factura_id') <> 'number') then
    raise exception 'NC_APLICACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
  end if;
  perform 1 from public.pagos_facturas
   where id = p_nc_id or id in (select (e ->> 'factura_id')::bigint from jsonb_array_elements(p_aplica_a) e)
   order by id for update;
  select * into v_nc from public.pagos_facturas where id = p_nc_id;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  if v_nc.clase <> 'nota_credito' then
    raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id, 'campo', 'nc_id')::text;
  end if;
  if v_nc.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  if v_nc.aprobada_at is null then
    raise exception 'NC_NO_APROBADA' using errcode = 'P0001', detail = json_build_object('nc_id', p_nc_id, 'estado', v_nc.estado)::text;
  end if;
  select v_nc.total - coalesce(sum(a.monto), 0) into v_disp from public.pagos_nc_aplicaciones a where a.nc_id = p_nc_id;
  if v_disp <= 0.001 then
    raise exception 'NC_SIN_CREDITO' using errcode = 'P0001', detail = json_build_object('nc_id', p_nc_id, 'nc_disponible', v_disp)::text;
  end if;

  perform public._pagos_guardar_aplicaciones(p_nc_id, p_aplica_a, p_user_id, true);

  return jsonb_build_object(
    'nc', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_nc_id),
    'facturas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.v_pagos_facturas v
                  where v.id in (select (e ->> 'factura_id')::bigint from jsonb_array_elements(p_aplica_a) e)));
end $function$;
revoke all on function public.pagos_aplicar_nc(bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pagos_aplicar_nc(bigint, jsonb, uuid) to service_role;

-- ── 6) Se retira la devolución del proveedor (20260923g) ───────────────
drop function if exists public.pagos_devolucion_proveedor(bigint, jsonb, jsonb, text, jsonb, uuid);
