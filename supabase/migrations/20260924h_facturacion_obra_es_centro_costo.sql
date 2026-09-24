-- =====================================================================
-- 20260924h — Facturación: el centro de costo es la OBRA (decisión 23/09).
--
-- Hasta hoy ventas_guardar_borrador pedía un centro_costo de la lista
-- cerrada btrim(obras.cc) (CENTRO_COSTO_REQUERIDO / _INVALIDO). obras.cc
-- quedó en desuso (20260923i): cada obra es su propio centro de costo.
--
--   · AVANCE DE OBRA exige obra_cod (OBRA_REQUERIDA). TRANSPORTE no.
--   · La obra, si viene, tiene que existir (OBRA_NO_EXISTE) y no ser
--     depósito (OBRA_DEPOSITO) ni interna (OBRA_INTERNA).
--   · centro_costo lo DERIVA la RPC: foto «COD — Nombre» de la obra (null
--     sin obra). El p_factura.centro_costo que mande un cliente viejo se
--     ignora. Es una foto: renombrar la obra no reescribe facturas.
--   · El CHECK ventas_facturas_cc_chk (avance ⇒ centro_costo no vacío) se
--     deja como está: con obra obligatoria siempre se cumple, y cambiarlo a
--     «avance ⇒ obra_cod» no validaría contra las autorizadas de homologación
--     que nacieron sin obra (6, 7, 21, 22, 23). Las autorizadas no se tocan
--     (la 17 de prod, obra CC-026, sigue diciendo 'BRADEL').
-- =====================================================================

create or replace function public.ventas_guardar_borrador(p_factura jsonb, p_renglones jsonb, p_user_id uuid,
                                                          p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        bigint := nullif(p_factura ->> 'id', '')::bigint;
  v_old       public.ventas_facturas%rowtype;
  v_cli       public.ventas_clientes%rowtype;
  v_asoc      public.ventas_facturas%rowtype;
  v_cta       public.ventas_cuentas_bancarias%rowtype;
  v_amb       text   := nullif(btrim(p_factura ->> 'ambiente'), '');
  v_pv        int    := nullif(p_factura ->> 'pto_vta', '')::int;
  v_tipo      smallint := nullif(p_factura ->> 'cbte_tipo', '')::smallint;
  v_cli_id    bigint := nullif(p_factura ->> 'cliente_id', '')::bigint;
  v_producto  text   := coalesce(nullif(btrim(p_factura ->> 'producto'), ''), 'AVANCE DE OBRA');
  v_cc        text;   -- foto «COD — Nombre» de la obra; lo que mande el cliente se ignora
  v_ob        public.obras%rowtype;
  v_obra      text   := nullif(btrim(p_factura ->> 'obra_cod'), '');
  v_concepto  smallint;
  v_fecha     date   := coalesce(nullif(p_factura ->> 'fecha_cbte', '')::date, public.hoy_ar());
  v_asoc_id   bigint := nullif(p_factura ->> 'asociada_id', '')::bigint;
  v_cta_id    bigint := nullif(p_factura ->> 'fce_cuenta_id', '')::bigint;
  v_vto_pago  date   := nullif(p_factura ->> 'fch_vto_pago', '')::date;
  v_transm    text   := upper(coalesce(nullif(btrim(p_factura ->> 'fce_transmision'), ''), 'SCA'));
  v_anul      text   := upper(coalesce(nullif(btrim(p_factura ->> 'nc_anulacion'), ''), 'N'));
  v_ref       text   := nullif(btrim(p_factura ->> 'fce_referencia'), '');
  v_e         jsonb;
  v_i         bigint;
  v_neto      numeric(14,2);
  v_iva       numeric(14,2);
  v_total     numeric(14,2);
  v_evento    text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if v_amb is null or v_amb not in ('homo', 'prod') then
    raise exception 'AMBIENTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('ambiente', v_amb)::text;
  end if;
  if v_pv is null or v_pv not between 1 and 99998 then
    raise exception 'PTO_VTA_INVALIDO' using errcode = 'P0001', detail = json_build_object('pto_vta', v_pv)::text;
  end if;
  if v_tipo is null or v_tipo not in (1, 3, 6, 8, 201, 203) then
    raise exception 'TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('cbte_tipo', v_tipo)::text;
  end if;

  if v_id is not null then
    select * into v_old from public.ventas_facturas where id = v_id for update;
    if not found then
      raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', v_id)::text;
    end if;
    if v_old.estado <> 'borrador' then
      raise exception 'FACTURA_NO_EDITABLE' using errcode = 'P0001',
        detail = json_build_object('factura_id', v_id, 'estado', v_old.estado)::text;
    end if;
  end if;

  -- Cliente y letra.
  if v_cli_id is null then
    raise exception 'CLIENTE_REQUERIDO' using errcode = 'P0001';
  end if;
  select * into v_cli from public.ventas_clientes where id = v_cli_id;
  if not found then
    raise exception 'CLIENTE_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cliente_id', v_cli_id)::text;
  end if;
  if not v_cli.activo then
    raise exception 'CLIENTE_INACTIVO' using errcode = 'P0001', detail = json_build_object('cliente_id', v_cli_id)::text;
  end if;
  perform public._ventas_validar_receptor(v_tipo, v_cli.doc_tipo, v_cli.condicion_iva_id);

  -- Producto y obra. La obra ES el centro de costo (decisión del 23/09):
  -- obligatoria en AVANCE DE OBRA, opcional en TRANSPORTE, y nunca interna ni
  -- depósito. centro_costo guarda una foto legible «COD — Nombre».
  if v_producto not in ('AVANCE DE OBRA', 'TRANSPORTE') then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('producto', v_producto)::text;
  end if;
  if v_producto = 'AVANCE DE OBRA' and v_obra is null then
    raise exception 'OBRA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod')::text;
  end if;
  if v_obra is not null then
    select * into v_ob from public.obras where cod = v_obra;
    if not found then
      raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod', 'obra_cod', v_obra)::text;
    end if;
    if v_ob.es_deposito then
      raise exception 'OBRA_DEPOSITO' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod', 'obra_cod', v_obra)::text;
    end if;
    if v_ob.es_interna then
      raise exception 'OBRA_INTERNA' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod', 'obra_cod', v_obra)::text;
    end if;
    v_cc := v_ob.cod || coalesce(' — ' || nullif(btrim(v_ob.nom), ''), '');
  end if;

  -- Concepto y fecha.
  v_concepto := coalesce(nullif(p_factura ->> 'concepto', '')::smallint,
                         case when v_producto = 'TRANSPORTE' then 2 else 3 end);
  if v_concepto not in (1, 2, 3) then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('concepto', v_concepto)::text;
  end if;
  perform public._ventas_validar_fecha(v_id, v_amb, v_pv, v_tipo, v_concepto, v_fecha);

  -- Renglones: validación.
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'SIN_RENGLONES' using errcode = 'P0001';
  end if;
  for v_e, v_i in select e, n from jsonb_array_elements(p_renglones) with ordinality as t(e, n) loop
    if length(btrim(coalesce(v_e ->> 'descripcion', ''))) = 0 then
      raise exception 'RENGLON_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'descripcion')::text;
    end if;
    if coalesce(round(nullif(v_e ->> 'cantidad', '')::numeric, 4), 1) <= 0 then
      raise exception 'RENGLON_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'cantidad')::text;
    end if;
    if nullif(v_e ->> 'precio_unit', '') is null or (v_e ->> 'precio_unit')::numeric < 0 then
      raise exception 'RENGLON_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'precio_unit')::text;
    end if;
    if public.ventas_tasa_iva(coalesce(nullif(v_e ->> 'alicuota_id', '')::smallint, 5::smallint)) is null then
      raise exception 'RENGLON_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'alicuota_id')::text;
    end if;
  end loop;

  -- Totales: neto por renglón redondeado; IVA sobre la base agrupada por alícuota.
  with r as (
    select coalesce(nullif(e ->> 'alicuota_id', '')::smallint, 5::smallint) as alic,
           round(round(coalesce(nullif(e ->> 'cantidad', '')::numeric, 1), 4) * round((e ->> 'precio_unit')::numeric, 3), 2) as neto
      from jsonb_array_elements(p_renglones) e
  ), g as (
    select alic, sum(neto) as base, round(sum(neto) * public.ventas_tasa_iva(alic), 2) as iva from r group by alic
  )
  select coalesce(sum(base), 0), coalesce(sum(iva), 0) into v_neto, v_iva from g;
  v_total := v_neto + v_iva;
  if v_total <= 0 then
    raise exception 'TOTAL_CERO' using errcode = 'P0001';
  end if;

  -- NC: factura asociada y saldo.
  if public._ventas_es_nc(v_tipo) then
    v_asoc := public._ventas_validar_nc(v_id, v_amb, v_tipo, v_cli_id, v_asoc_id, v_total, p_forzar, p_user_id);
  elsif v_asoc_id is not null then
    raise exception 'ASOCIADA_SOLO_NC' using errcode = 'P0001', detail = json_build_object('cbte_tipo', v_tipo)::text;
  end if;

  -- FCE (20260924e).
  if v_tipo = 201 then
    v_cta_id := coalesce(v_cta_id, v_cli.cuenta_fce_id,
                         (select id from public.ventas_cuentas_bancarias where es_default and activo limit 1));
    select * into v_cta from public.ventas_cuentas_bancarias where id = v_cta_id;
    if not found or not v_cta.activo then
      raise exception 'FCE_SIN_CUENTA' using errcode = 'P0001', detail = json_build_object('campo', 'fce_cuenta_id', 'fce_cuenta_id', v_cta_id)::text;
    end if;
    if v_transm not in ('SCA', 'ADC') then
      raise exception 'FCE_TRANSMISION_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'fce_transmision', 'fce_transmision', v_transm)::text;
    end if;
    v_vto_pago := coalesce(v_vto_pago, v_fecha);
    if v_vto_pago < v_fecha then
      raise exception 'FCE_VTO_PAGO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'fch_vto_pago', 'fch_vto_pago', v_vto_pago, 'fecha_cbte', v_fecha)::text;
    end if;
    if v_total < public._ventas_monto_minimo_fce() then
      if not coalesce(p_forzar, false) then
        raise exception 'NO_CORRESPONDE_FCE' using errcode = 'P0001',
          detail = json_build_object('motivo', 'monto_minimo', 'total', v_total, 'minimo', public._ventas_monto_minimo_fce())::text;
      end if;
      if not public._ventas_es_admin(p_user_id) then
        raise exception 'FORZAR_SOLO_ADMIN' using errcode = 'P0001',
          detail = json_build_object('total', v_total, 'minimo', public._ventas_monto_minimo_fce())::text;
      end if;
    end if;
  elsif v_tipo = 203 then
    if v_anul not in ('S', 'N') then
      raise exception 'NC_ANULACION_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'nc_anulacion', 'nc_anulacion', v_anul)::text;
    end if;
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);

  if v_id is null then
    insert into public.ventas_facturas (
      ambiente, pto_vta, cbte_tipo, estado, concepto, fecha_cbte, fch_vto_pago, cliente_id,
      rec_razon_social, rec_doc_tipo, rec_doc_nro, rec_condicion_iva_id, rec_domicilio,
      obra_cod, producto, centro_costo, provincia_origen, provincia_destino, condicion_pago,
      remitos, observaciones, obs_interna, imp_neto, imp_iva, imp_total,
      fce_cuenta_id, fce_cbu, fce_alias, fce_banco, fce_transmision, nc_anulacion, fce_referencia,
      created_by, updated_by)
    values (
      v_amb, v_pv, v_tipo, 'borrador', v_concepto, v_fecha,
      case when v_tipo = 201 then v_vto_pago when v_concepto = 1 then null else v_fecha end, v_cli_id,
      v_cli.razon_social, v_cli.doc_tipo, v_cli.doc_nro, v_cli.condicion_iva_id, v_cli.domicilio,
      v_obra, v_producto, v_cc,
      coalesce(nullif(btrim(p_factura ->> 'provincia_origen'), ''), 'Tucuman'),
      coalesce(nullif(btrim(p_factura ->> 'provincia_destino'), ''), nullif(btrim(v_cli.provincia), ''), 'Tucuman'),
      coalesce(nullif(btrim(p_factura ->> 'condicion_pago'), ''), 'Cc Clientes'),
      coalesce(btrim(p_factura ->> 'remitos'), ''), coalesce(btrim(p_factura ->> 'observaciones'), ''),
      coalesce(p_factura ->> 'obs_interna', ''),
      v_neto, v_iva, v_total,
      case when v_tipo = 201 then v_cta.id end, case when v_tipo = 201 then v_cta.cbu end,
      case when v_tipo = 201 then nullif(v_cta.alias, '') end, case when v_tipo = 201 then v_cta.banco end,
      case when v_tipo = 201 then v_transm end, case when v_tipo = 203 then v_anul end,
      case when v_tipo = 201 then left(v_ref, 50) end,
      p_user_id, p_user_id)
    returning id into v_id;
    v_evento := 'creada';
  else
    update public.ventas_facturas set
      ambiente = v_amb, pto_vta = v_pv, cbte_tipo = v_tipo, concepto = v_concepto, fecha_cbte = v_fecha,
      fch_vto_pago = case when v_tipo = 201 then v_vto_pago when v_concepto = 1 then null else v_fecha end,
      cliente_id = v_cli_id,
      rec_razon_social = v_cli.razon_social, rec_doc_tipo = v_cli.doc_tipo, rec_doc_nro = v_cli.doc_nro,
      rec_condicion_iva_id = v_cli.condicion_iva_id, rec_domicilio = v_cli.domicilio,
      obra_cod = v_obra, producto = v_producto, centro_costo = v_cc,
      provincia_origen = coalesce(nullif(btrim(p_factura ->> 'provincia_origen'), ''), 'Tucuman'),
      provincia_destino = coalesce(nullif(btrim(p_factura ->> 'provincia_destino'), ''), nullif(btrim(v_cli.provincia), ''), 'Tucuman'),
      condicion_pago = coalesce(nullif(btrim(p_factura ->> 'condicion_pago'), ''), 'Cc Clientes'),
      remitos = coalesce(btrim(p_factura ->> 'remitos'), ''), observaciones = coalesce(btrim(p_factura ->> 'observaciones'), ''),
      obs_interna = coalesce(p_factura ->> 'obs_interna', v_old.obs_interna),
      imp_neto = v_neto, imp_iva = v_iva, imp_trib = 0, imp_op_ex = 0, imp_tot_conc = 0, imp_total = v_total,
      fce_cuenta_id = case when v_tipo = 201 then v_cta.id end,
      fce_cbu = case when v_tipo = 201 then v_cta.cbu end,
      fce_alias = case when v_tipo = 201 then nullif(v_cta.alias, '') end,
      fce_banco = case when v_tipo = 201 then v_cta.banco end,
      fce_transmision = case when v_tipo = 201 then v_transm end,
      nc_anulacion = case when v_tipo = 203 then v_anul end,
      fce_referencia = case when v_tipo = 201 then left(v_ref, 50) end,
      updated_by = p_user_id
    where id = v_id;
    delete from public.ventas_factura_renglones where factura_id = v_id;
    delete from public.ventas_factura_alicuotas where factura_id = v_id;
    delete from public.ventas_factura_asociados where factura_id = v_id;
    v_evento := 'editada';
  end if;

  insert into public.ventas_factura_renglones (factura_id, orden, descripcion, cantidad, unidad, precio_unit, alicuota_id, importe_neto)
  select v_id, n::smallint, btrim(e ->> 'descripcion'),
         round(coalesce(nullif(e ->> 'cantidad', '')::numeric, 1), 4),
         coalesce(nullif(btrim(e ->> 'unidad'), ''), 'Unidades'),
         round((e ->> 'precio_unit')::numeric, 3),
         coalesce(nullif(e ->> 'alicuota_id', '')::smallint, 5::smallint),
         round(round(coalesce(nullif(e ->> 'cantidad', '')::numeric, 1), 4) * round((e ->> 'precio_unit')::numeric, 3), 2)
    from jsonb_array_elements(p_renglones) with ordinality as t(e, n);

  insert into public.ventas_factura_alicuotas (factura_id, alicuota_id, base_imp, importe)
  select v_id, alicuota_id, sum(importe_neto), round(sum(importe_neto) * public.ventas_tasa_iva(alicuota_id), 2)
    from public.ventas_factura_renglones where factura_id = v_id group by alicuota_id;

  if public._ventas_es_nc(v_tipo) then
    insert into public.ventas_factura_asociados (factura_id, asociada_id, cbte_tipo, pto_vta, numero, cuit, fecha_cbte)
    values (v_id, v_asoc.id, v_asoc.cbte_tipo, v_asoc.pto_vta, v_asoc.numero, public._ventas_cuit_emisor(), v_asoc.fecha_cbte);
  end if;

  perform public._ventas_evento(v_id, v_evento, case when v_evento = 'editada' then 'borrador' end, 'borrador',
                                jsonb_build_object('imp_total', v_total, 'forzada', coalesce(p_forzar, false)), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_factura_json(v_id);
end $$;

-- ── 2. ventas_confirmar_emision: no pisar el vencimiento de la FCE ────
-- Hasta hoy, al autorizar, fch_vto_pago := fecha (el dueño no usa
-- vencimiento). En la 201 lo eligió el usuario y es lo que se mandó a ARCA:

-- ── Grants (solo service_role) ────────────────────────────────────────
revoke all on function public.ventas_guardar_borrador(jsonb, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ventas_guardar_borrador(jsonb, jsonb, uuid, boolean) to service_role;
