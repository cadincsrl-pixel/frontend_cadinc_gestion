-- =====================================================================
-- 20260924f — Facturación, fase 6 (FCE 201/203): las RPC.
--
-- Requiere 20260924e (cuentas bancarias, columnas fce_* y nc_anulacion).
-- Separada del schema para poder probarla con rollback sobre el schema ya
-- aplicado. Qué cambia respecto de 20260924c:
--   * ventas_guardar_borrador: toma la cuenta, la transmisión y el
--     vencimiento de pago de la 201 (y el monto mínimo), y el opcional 22
--     (nc_anulacion) de la 203.
--   * ventas_confirmar_emision: no pisa el vencimiento de pago de la 201.
--   * `fce_referencia`: la «Referencia Comercial» de la FCE (opcional 23 de
--     WSFE; Banco Macro pone su número de orden de compra). Solo en la 201,
--     optativa. La vista la suma al final.
-- =====================================================================

alter table public.ventas_facturas
  add column fce_referencia text check (fce_referencia is null or length(btrim(fce_referencia)) between 1 and 50),
  add constraint ventas_facturas_fce_ref_chk check (cbte_tipo = 201 or fce_referencia is null);
comment on column public.ventas_facturas.fce_referencia is
  'FCE 201: Referencia Comercial (opcional 23 de WSFE), p. ej. la OC del cliente. Se imprime arriba de la opción de transferencia. 20260924f.';

create or replace view public.v_ventas_facturas with (security_invoker = true) as
select f.id, f.ambiente, f.pto_vta, f.cbte_tipo, f.numero, f.numero_intentado, f.estado, f.concepto,
       f.fecha_cbte, f.fch_vto_pago, f.cliente_id,
       f.rec_razon_social, f.rec_doc_tipo, f.rec_doc_nro, f.rec_condicion_iva_id, f.rec_domicilio,
       f.obra_cod, f.producto, f.centro_costo, f.provincia_origen, f.provincia_destino, f.condicion_pago,
       f.remitos, f.observaciones, f.moneda, f.cotizacion,
       f.imp_neto, f.imp_iva, f.imp_trib, f.imp_op_ex, f.imp_tot_conc, f.imp_total,
       f.cae, f.cae_vto, f.resultado, f.observaciones_arca, f.errores_arca, f.intento_at, f.intento_n,
       f.emitida_por, f.emitida_at, f.numero_finnegans, f.registrada_at, f.registrada_por, f.obs_interna,
       f.created_at, f.updated_at, f.created_by, f.updated_by,
       -- derivadas
       case when f.cbte_tipo in (1, 3, 201, 203) then 'A' else 'B' end                         as letra,
       case f.cbte_tipo when 1 then 'Factura A' when 3 then 'Nota de Crédito A'
                        when 6 then 'Factura B' when 8 then 'Nota de Crédito B'
                        when 201 then 'Factura de Crédito Electrónica MiPyMEs A'
                        when 203 then 'Nota de Crédito Electrónica MiPyMEs A' end              as tipo_nombre,
       lpad(f.cbte_tipo::text, 3, '0')                                                          as cod_cbte,
       (f.cbte_tipo in (3, 8, 203))                                                             as es_nc,
       case when f.numero is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0') end       as numero_fmt,
       case when f.numero_intentado is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero_intentado::text, 8, '0') end as numero_intentado_fmt,
       (f.ambiente = 'homo')                                                                    as es_homologacion,
       (f.estado = 'autorizada' and f.numero_finnegans is null)                                 as pendiente_finnegans,
       to_char(f.fecha_cbte, 'YYYY-MM')                                                         as mes,
       c.razon_social as cliente_razon_social, c.activo as cliente_activo, c.email as cliente_email,
       o.nom as obra_nom,
       pc.nombre as created_by_nombre, pe.nombre as emitida_por_nombre, pr.nombre as registrada_por_nombre,
       coalesce(nc.total_nc, 0)::numeric(14,2)                                                  as nc_autorizadas,
       case when f.cbte_tipo not in (3, 8, 203) and f.estado = 'autorizada'
            then (f.imp_total - coalesce(nc.total_nc, 0))::numeric(14,2) end                     as saldo_nc,
       asoc.asociada_id,
       case when asoc.asociada_id is not null
            then lpad(asoc.pto_vta::text, 5, '0') || '-' || lpad(asoc.numero::text, 8, '0') end  as asociada_numero_fmt,
       asoc.cbte_tipo as asociada_cbte_tipo,
       public.norm_txt(coalesce(lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), '') || ' '
                       || coalesce(f.numero::text, '') || ' ' || f.rec_razon_social || ' ' || f.rec_doc_nro || ' '
                       || f.producto || ' ' || coalesce(f.centro_costo, '') || ' ' || coalesce(f.obra_cod, '') || ' '
                       || coalesce(o.nom, '') || ' ' || f.observaciones || ' ' || f.remitos || ' '
                       || coalesce(f.numero_finnegans, '') || ' ' || coalesce(f.cae, ''))       as busq,
       -- 20260924e: FCE
       f.fce_cuenta_id, f.fce_cbu, f.fce_alias, f.fce_banco, f.fce_transmision, f.nc_anulacion,
       (f.cbte_tipo in (201, 202, 203))                                                         as es_fce,
       asoc.fecha_cbte                                                                          as asociada_fecha_cbte,
       f.fce_referencia
from public.ventas_facturas f
join public.ventas_clientes c on c.id = f.cliente_id
left join public.obras o on o.cod = f.obra_cod
left join public.profiles pc on pc.id = f.created_by
left join public.profiles pe on pe.id = f.emitida_por
left join public.profiles pr on pr.id = f.registrada_por
left join lateral (
  select sum(n.imp_total) as total_nc
    from public.ventas_factura_asociados a join public.ventas_facturas n on n.id = a.factura_id
   where a.asociada_id = f.id and n.estado = 'autorizada') nc on true
left join lateral (
  select a.asociada_id, a.pto_vta, a.numero, a.cbte_tipo, a.fecha_cbte
    from public.ventas_factura_asociados a where a.factura_id = f.id order by a.id limit 1) asoc on true;

revoke all on table public.v_ventas_facturas from public, anon, authenticated;
grant select on table public.v_ventas_facturas to service_role;

-- ── 1. ventas_guardar_borrador: FCE ───────────────────────────────────
-- Igual que 20260924c más:
--   201: cuenta (p_factura.fce_cuenta_id → la preferida del cliente → la de
--        por defecto), transmisión (default SCA), vencimiento de pago
--        (default = fecha) y monto mínimo (NO_CORRESPONDE_FCE, admin forzar).
--   203: nc_anulacion (default 'N'), sin CBU.
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
  v_cc        text   := nullif(btrim(p_factura ->> 'centro_costo'), '');
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

  -- Producto, centro de costo, obra.
  if v_producto not in ('AVANCE DE OBRA', 'TRANSPORTE') then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('producto', v_producto)::text;
  end if;
  if v_producto = 'AVANCE DE OBRA' and v_cc is null then
    raise exception 'CENTRO_COSTO_REQUERIDO' using errcode = 'P0001';
  end if;
  if v_cc is not null and not exists (select 1 from public.obras where btrim(cc) = v_cc) then
    raise exception 'CENTRO_COSTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('centro_costo', v_cc)::text;
  end if;
  if v_obra is not null and not exists (select 1 from public.obras where cod = v_obra) then
    raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('obra_cod', v_obra)::text;
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
-- se conserva (y nunca queda antes de la fecha de ARCA).
create or replace function public.ventas_confirmar_emision(p_id bigint, p_res jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f      public.ventas_facturas%rowtype;
  v_res    text := upper(coalesce(nullif(btrim(p_res ->> 'resultado'), ''), 'INCIERTO'));
  v_num    bigint;
  v_cae    text := nullif(btrim(p_res ->> 'cae'), '');
  v_vto    date := nullif(p_res ->> 'cae_vto', '')::date;
  v_fecha  date := nullif(p_res ->> 'fecha_cbte', '')::date;
  v_con    text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if v_res not in ('A', 'R', 'INCIERTO') then
    raise exception 'RESULTADO_INVALIDO' using errcode = 'P0001', detail = json_build_object('resultado', p_res ->> 'resultado')::text;
  end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.estado not in ('emitiendo', 'error_reconciliar') then
    raise exception 'FACTURA_NO_EMITIENDO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);

  if v_res = 'A' then
    v_num := coalesce(nullif(p_res ->> 'numero', '')::bigint, v_f.numero_intentado);
    if v_num is null then
      raise exception 'NUMERO_REQUERIDO' using errcode = 'P0001';
    end if;
    if v_f.numero_intentado is not null and v_num <> v_f.numero_intentado then
      raise exception 'NUMERO_NO_COINCIDE' using errcode = 'P0001',
        detail = json_build_object('numero', v_num, 'numero_intentado', v_f.numero_intentado)::text;
    end if;
    if v_cae is null or v_cae !~ '^[0-9]{14}$' then
      raise exception 'CAE_INVALIDO' using errcode = 'P0001', detail = json_build_object('cae', v_cae)::text;
    end if;
    if v_vto is null then
      raise exception 'CAE_VTO_REQUERIDO' using errcode = 'P0001';
    end if;
    begin
      update public.ventas_facturas
         set estado = 'autorizada', numero = v_num, numero_intentado = v_num, cae = v_cae, cae_vto = v_vto,
             resultado = 'A',
             fecha_cbte = coalesce(v_fecha, fecha_cbte),
             fch_vto_pago = case when cbte_tipo = 201 then greatest(fch_vto_pago, coalesce(v_fecha, fecha_cbte))
                                 when concepto = 1 then null
                                 else coalesce(v_fecha, fecha_cbte) end,
             observaciones_arca = p_res -> 'observaciones', errores_arca = p_res -> 'errores',
             emitida_at = now(), emitida_por = coalesce(emitida_por, p_user_id), updated_by = p_user_id
       where id = p_id;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'ventas_facturas_numero_uidx' then raise; end if;
      raise exception 'NUMERO_DUPLICADO' using errcode = 'P0001',
        detail = json_build_object('numero', v_num, 'ambiente', v_f.ambiente, 'pto_vta', v_f.pto_vta, 'cbte_tipo', v_f.cbte_tipo)::text;
    end;
    perform public._ventas_evento(p_id, 'autorizada', v_f.estado, 'autorizada',
      jsonb_build_object('numero', v_num, 'cae', v_cae, 'cae_vto', v_vto, 'reconciliada', v_f.estado = 'error_reconciliar',
                         'observaciones', p_res -> 'observaciones'), p_user_id);

  elsif v_res = 'R' then
    update public.ventas_facturas
       set estado = 'rechazada', resultado = 'R', numero_intentado = null,
           observaciones_arca = p_res -> 'observaciones', errores_arca = p_res -> 'errores', updated_by = p_user_id
     where id = p_id;
    perform public._ventas_evento(p_id, 'rechazada', v_f.estado, 'rechazada',
      jsonb_build_object('numero_intentado', v_f.numero_intentado, 'errores', p_res -> 'errores',
                         'observaciones', p_res -> 'observaciones'), p_user_id);

  else  -- INCIERTO
    update public.ventas_facturas
       set estado = 'error_reconciliar',
           errores_arca = coalesce(p_res -> 'errores', jsonb_build_array(jsonb_build_object('error', p_res ->> 'error'))),
           updated_by = p_user_id
     where id = p_id;
    perform public._ventas_evento(p_id, 'error_reconciliar', v_f.estado, 'error_reconciliar',
      jsonb_build_object('numero_intentado', v_f.numero_intentado, 'error', p_res ->> 'error'), p_user_id);
  end if;

  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_factura_json(p_id);
end $$;

-- ── Grants (solo service_role) ────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'ventas_guardar_borrador(jsonb, jsonb, uuid, boolean)',
    'ventas_confirmar_emision(bigint, jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
