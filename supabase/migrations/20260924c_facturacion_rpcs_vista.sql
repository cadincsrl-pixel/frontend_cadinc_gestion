-- =====================================================================
-- Facturación electrónica, fase 1 — vista y RPCs (2026-09-24)
--
-- Requiere 20260924a (tablas) y 20260924b (permisos: _ventas_flag).
--
-- RPCs: SECURITY DEFINER, EXECUTE solo service_role, p_user_id explícito,
-- nunca auth.uid(). Errores: `raise exception 'CODIGO' using errcode='P0001',
-- detail = '<json>'` — el backend lee error.message como código y
-- error.details como JSON (mismo patrón que Pagos).
--
-- Ciclo de un comprobante:
--
--   ventas_guardar_borrador ──► borrador ──ventas_iniciar_emision──► emitiendo
--        (recalcula totales)        ▲                                  │
--                                   │                    ventas_marcar_intento (numero_intentado,
--                                   │                    ANTES de llamar a FECAESolicitar)
--                                   │                                  │
--                                   │              ventas_confirmar_emision(p_res)
--                                   │           ┌──────────────┼───────────────────┐
--                                   │         A │            R │          incierto │
--                                   │           ▼              ▼                   ▼
--                                   │      autorizada      rechazada       error_reconciliar
--                                   │      (inmutable)         │                   │
--                                   └── ventas_volver_a_borrador ◄──────────────────┘
--                                        (ARCA NO tiene el número:        (si ARCA SÍ lo tiene,
--                                         lo verificó el backend           ventas_confirmar_emision
--                                         con FECompConsultar)             con resultado A)
--
--   borrador | rechazada ──ventas_descartar──► descartada
--   autorizada ──ventas_registrar_finnegans / ventas_deshacer_registro
--
-- Reglas que viven acá (y el backend espeja):
--   * Totales: importe_neto = round(cantidad × precio_unit, 2) por renglón;
--     IVA por alícuota = round(Σ bases del grupo × tasa, 2), NO renglón por
--     renglón; total = neto + IVA. Los calcula SIEMPRE el server: lo que mande
--     el cliente como total se ignora.
--   * Letra A: receptor con CUIT (doc 80) y condición IVA 1/6/13/16. Letra B:
--     cualquier receptor que no sea RI (1).
--   * Fecha: ±5 días de hoy (concepto 1) o ±10 (2 y 3), y nunca anterior a la
--     del último comprobante autorizado del talonario.
--   * Concepto por defecto según producto: AVANCE DE OBRA → 3, TRANSPORTE → 2.
--     Con 2/3, FchServDesde = FchServHasta = FchVtoPago = fecha del comprobante
--     (fch_vto_pago se guarda igual a fecha_cbte).
--   * NC: factura autorizada de la misma letra, mismo ambiente y mismo
--     cliente; su total ≤ saldo = total de la factura − NC autorizadas o en
--     vuelo (emitiendo / error_reconciliar). Solo el admin puede forzar.
--   * Centro de costo: obligatorio con AVANCE DE OBRA; siempre uno de los
--     `btrim(obras.cc)` existentes (lista cerrada, nunca texto libre).
-- =====================================================================

-- ── Vista ─────────────────────────────────────────────────────────────

create view public.v_ventas_facturas with (security_invoker = true) as
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
       -- Notas de crédito autorizadas que apuntan a esta factura (0 si es una NC).
       coalesce(nc.total_nc, 0)::numeric(14,2)                                                  as nc_autorizadas,
       case when f.cbte_tipo not in (3, 8, 203) and f.estado = 'autorizada'
            then (f.imp_total - coalesce(nc.total_nc, 0))::numeric(14,2) end                     as saldo_nc,
       -- Si es NC: la factura que corrige.
       asoc.asociada_id,
       case when asoc.asociada_id is not null
            then lpad(asoc.pto_vta::text, 5, '0') || '-' || lpad(asoc.numero::text, 8, '0') end  as asociada_numero_fmt,
       asoc.cbte_tipo as asociada_cbte_tipo,
       public.norm_txt(coalesce(lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), '') || ' '
                       || coalesce(f.numero::text, '') || ' ' || f.rec_razon_social || ' ' || f.rec_doc_nro || ' '
                       || f.producto || ' ' || coalesce(f.centro_costo, '') || ' ' || coalesce(f.obra_cod, '') || ' '
                       || coalesce(o.nom, '') || ' ' || f.observaciones || ' ' || f.remitos || ' '
                       || coalesce(f.numero_finnegans, '') || ' ' || coalesce(f.cae, ''))       as busq
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
  select a.asociada_id, a.pto_vta, a.numero, a.cbte_tipo
    from public.ventas_factura_asociados a where a.factura_id = f.id order by a.id limit 1) asoc on true;

comment on view public.v_ventas_facturas is
  'Facturas de venta con número formateado (00003-00000012), letra, saldo para NC, pendiente de Finnegans y busq (norm_txt). 20260924c.';

revoke all on table public.v_ventas_facturas from public, anon, authenticated;
grant select on table public.v_ventas_facturas to service_role;

-- ── Helpers internos ──────────────────────────────────────────────────

create or replace function public._ventas_cuit_emisor() returns text
language sql immutable set search_path = public, pg_temp as $$ select '33717191949'::text $$;

create or replace function public._ventas_es_nc(p_tipo smallint) returns boolean
language sql immutable set search_path = public, pg_temp as $$ select p_tipo in (3, 8, 203) $$;

-- La factura que corrige cada tipo de NC.
create or replace function public._ventas_tipo_factura_de_nc(p_tipo smallint) returns smallint
language sql immutable set search_path = public, pg_temp as $$
  select case p_tipo when 3 then 1 when 8 then 6 when 203 then 201 end::smallint
$$;

create or replace function public._ventas_validar_receptor(p_tipo smallint, p_doc_tipo smallint, p_cond smallint)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_tipo in (1, 3, 201, 203) and (p_doc_tipo <> 80 or p_cond not in (1, 6, 13, 16)) then
    raise exception 'LETRA_INCOMPATIBLE' using errcode = 'P0001',
      detail = json_build_object('letra', 'A', 'doc_tipo', p_doc_tipo, 'condicion_iva_id', p_cond)::text;
  end if;
  if p_tipo in (6, 8) and p_cond = 1 then
    raise exception 'LETRA_INCOMPATIBLE' using errcode = 'P0001',
      detail = json_build_object('letra', 'B', 'doc_tipo', p_doc_tipo, 'condicion_iva_id', p_cond)::text;
  end if;
end $$;

-- Ventana de ARCA respecto de hoy y orden dentro del talonario.
create or replace function public._ventas_validar_fecha(p_id bigint, p_ambiente text, p_pto_vta int, p_tipo smallint,
                                                        p_concepto smallint, p_fecha date)
returns void language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_margen int := case when p_concepto = 1 then 5 else 10 end;
  v_hoy    date := public.hoy_ar();
  v_ult    date;
begin
  if p_fecha < v_hoy - v_margen or p_fecha > v_hoy + v_margen then
    raise exception 'FECHA_FUERA_DE_RANGO' using errcode = 'P0001',
      detail = json_build_object('fecha', p_fecha, 'desde', v_hoy - v_margen, 'hasta', v_hoy + v_margen)::text;
  end if;
  select max(fecha_cbte) into v_ult
    from public.ventas_facturas
   where ambiente = p_ambiente and pto_vta = p_pto_vta and cbte_tipo = p_tipo
     and estado = 'autorizada' and id <> coalesce(p_id, -1);
  if v_ult is not null and p_fecha < v_ult then
    raise exception 'FECHA_ANTERIOR_AL_ULTIMO' using errcode = 'P0001',
      detail = json_build_object('fecha', p_fecha, 'ultima', v_ult)::text;
  end if;
end $$;

-- Valida la factura que corrige una NC y el saldo. Devuelve la fila asociada.
create or replace function public._ventas_validar_nc(p_nc_id bigint, p_ambiente text, p_tipo smallint, p_cliente_id bigint,
                                                     p_asociada_id bigint, p_total numeric, p_forzar boolean, p_user_id uuid)
returns public.ventas_facturas language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_a     public.ventas_facturas%rowtype;
  v_otras numeric(14,2);
  v_saldo numeric(14,2);
begin
  if p_asociada_id is null then
    raise exception 'NC_SIN_FACTURA' using errcode = 'P0001';
  end if;
  select * into v_a from public.ventas_facturas where id = p_asociada_id;
  if not found then
    raise exception 'NC_FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('asociada_id', p_asociada_id)::text;
  end if;
  if v_a.estado <> 'autorizada' then
    raise exception 'NC_FACTURA_NO_AUTORIZADA' using errcode = 'P0001',
      detail = json_build_object('asociada_id', p_asociada_id, 'estado', v_a.estado)::text;
  end if;
  if v_a.cbte_tipo <> public._ventas_tipo_factura_de_nc(p_tipo) then
    raise exception 'NC_TIPO_NO_COINCIDE' using errcode = 'P0001',
      detail = json_build_object('nc_tipo', p_tipo, 'factura_tipo', v_a.cbte_tipo)::text;
  end if;
  if v_a.ambiente <> p_ambiente then
    raise exception 'AMBIENTE_NO_COINCIDE' using errcode = 'P0001',
      detail = json_build_object('esperado', p_ambiente, 'factura', v_a.ambiente)::text;
  end if;
  if v_a.cliente_id <> p_cliente_id then
    raise exception 'NC_OTRO_CLIENTE' using errcode = 'P0001',
      detail = json_build_object('asociada_id', p_asociada_id, 'cliente_factura', v_a.cliente_id, 'cliente_nc', p_cliente_id)::text;
  end if;
  select coalesce(sum(n.imp_total), 0) into v_otras
    from public.ventas_factura_asociados a join public.ventas_facturas n on n.id = a.factura_id
   where a.asociada_id = p_asociada_id and n.id <> coalesce(p_nc_id, -1)
     and n.estado in ('autorizada', 'emitiendo', 'error_reconciliar');
  v_saldo := v_a.imp_total - v_otras;
  if p_total > v_saldo then
    if not coalesce(p_forzar, false) then
      raise exception 'NC_SUPERA_FACTURA' using errcode = 'P0001',
        detail = json_build_object('saldo', v_saldo, 'total', p_total, 'asociada_id', p_asociada_id)::text;
    end if;
    if not public._ventas_es_admin(p_user_id) then
      raise exception 'FORZAR_SOLO_ADMIN' using errcode = 'P0001',
        detail = json_build_object('saldo', v_saldo, 'total', p_total)::text;
    end if;
  end if;
  return v_a;
end $$;

create or replace function public._ventas_evento(p_factura_id bigint, p_tipo text, p_antes text, p_despues text,
                                                 p_detalle jsonb, p_user_id uuid)
returns void language sql set search_path = public, pg_temp as $$
  insert into public.ventas_factura_eventos (factura_id, tipo, estado_antes, estado_despues, detalle, user_id)
  values (p_factura_id, p_tipo, p_antes, p_despues, coalesce(p_detalle, '{}'::jsonb), p_user_id)
$$;

-- Forma de respuesta común: { factura, renglones, alicuotas, asociados }.
create or replace function public._ventas_factura_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_ventas_facturas v where v.id = p_id),
    'renglones', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'orden', r.orden, 'descripcion', r.descripcion, 'cantidad', r.cantidad,
                                          'unidad', r.unidad, 'precio_unit', r.precio_unit, 'alicuota_id', r.alicuota_id,
                                          'tasa', public.ventas_tasa_iva(r.alicuota_id), 'importe_neto', r.importe_neto)
                       order by r.orden)
        from public.ventas_factura_renglones r where r.factura_id = p_id), '[]'::jsonb),
    'alicuotas', coalesce((
      select jsonb_agg(jsonb_build_object('alicuota_id', a.alicuota_id, 'tasa', public.ventas_tasa_iva(a.alicuota_id),
                                          'base_imp', a.base_imp, 'importe', a.importe)
                       order by a.alicuota_id)
        from public.ventas_factura_alicuotas a where a.factura_id = p_id), '[]'::jsonb),
    'asociados', coalesce((
      select jsonb_agg(jsonb_build_object('asociada_id', s.asociada_id, 'cbte_tipo', s.cbte_tipo, 'pto_vta', s.pto_vta,
                                          'numero', s.numero, 'cuit', s.cuit, 'fecha_cbte', s.fecha_cbte)
                       order by s.id)
        from public.ventas_factura_asociados s where s.factura_id = p_id), '[]'::jsonb))
$$;

-- ── ventas_guardar_borrador ───────────────────────────────────────────
-- Crea (p_factura.id ausente) o reemplaza por completo un borrador. El
-- formulario manda TODO: lo ausente toma su default. Recalcula totales y
-- alícuotas a partir de los renglones; los totales del cliente se ignoran.
create or replace function public.ventas_guardar_borrador(p_factura jsonb, p_renglones jsonb, p_user_id uuid,
                                                          p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        bigint := nullif(p_factura ->> 'id', '')::bigint;
  v_old       public.ventas_facturas%rowtype;
  v_cli       public.ventas_clientes%rowtype;
  v_asoc      public.ventas_facturas%rowtype;
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

  perform set_config('cadinc.ventas_rpc', 'on', true);

  if v_id is null then
    insert into public.ventas_facturas (
      ambiente, pto_vta, cbte_tipo, estado, concepto, fecha_cbte, fch_vto_pago, cliente_id,
      rec_razon_social, rec_doc_tipo, rec_doc_nro, rec_condicion_iva_id, rec_domicilio,
      obra_cod, producto, centro_costo, provincia_origen, provincia_destino, condicion_pago,
      remitos, observaciones, obs_interna, imp_neto, imp_iva, imp_total, created_by, updated_by)
    values (
      v_amb, v_pv, v_tipo, 'borrador', v_concepto, v_fecha, case when v_concepto = 1 then null else v_fecha end, v_cli_id,
      v_cli.razon_social, v_cli.doc_tipo, v_cli.doc_nro, v_cli.condicion_iva_id, v_cli.domicilio,
      v_obra, v_producto, v_cc,
      coalesce(nullif(btrim(p_factura ->> 'provincia_origen'), ''), 'Tucuman'),
      coalesce(nullif(btrim(p_factura ->> 'provincia_destino'), ''), nullif(btrim(v_cli.provincia), ''), 'Tucuman'),
      coalesce(nullif(btrim(p_factura ->> 'condicion_pago'), ''), 'Cc Clientes'),
      coalesce(btrim(p_factura ->> 'remitos'), ''), coalesce(btrim(p_factura ->> 'observaciones'), ''),
      coalesce(p_factura ->> 'obs_interna', ''),
      v_neto, v_iva, v_total, p_user_id, p_user_id)
    returning id into v_id;
    v_evento := 'creada';
  else
    update public.ventas_facturas set
      ambiente = v_amb, pto_vta = v_pv, cbte_tipo = v_tipo, concepto = v_concepto, fecha_cbte = v_fecha,
      fch_vto_pago = case when v_concepto = 1 then null else v_fecha end,
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

-- ── ventas_iniciar_emision ────────────────────────────────────────────
-- borrador → emitiendo. Toma el lock del talonario (índice único parcial) y
-- vuelve a validar todo con la fecha de HOY y la foto del cliente de hoy.
create or replace function public.ventas_iniciar_emision(p_id bigint, p_ambiente text, p_user_id uuid,
                                                         p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f     public.ventas_facturas%rowtype;
  v_cli   public.ventas_clientes%rowtype;
  v_flag  text;
  v_asoc  bigint;
  v_con   text;
  v_bloq  bigint;
  v_ult   bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if p_ambiente is not null and p_ambiente <> v_f.ambiente then
    raise exception 'AMBIENTE_NO_COINCIDE' using errcode = 'P0001',
      detail = json_build_object('esperado', p_ambiente, 'factura', v_f.ambiente)::text;
  end if;
  if v_f.estado in ('emitiendo', 'error_reconciliar') then
    raise exception 'EMISION_EN_CURSO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'bloqueada_por', p_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.estado <> 'borrador' then
    raise exception 'FACTURA_NO_EMITIBLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;

  v_flag := case when public._ventas_es_nc(v_f.cbte_tipo) then 'emitir_notas_credito' else 'emitir_facturas' end;
  if not public._ventas_flag(p_user_id, v_flag, false) then
    raise exception 'SIN_PERMISO_EMITIR' using errcode = 'P0001', detail = json_build_object('flag', v_flag)::text;
  end if;

  select * into v_cli from public.ventas_clientes where id = v_f.cliente_id;
  if not coalesce(v_cli.activo, false) then
    raise exception 'CLIENTE_INACTIVO' using errcode = 'P0001', detail = json_build_object('cliente_id', v_f.cliente_id)::text;
  end if;
  perform public._ventas_validar_receptor(v_f.cbte_tipo, v_cli.doc_tipo, v_cli.condicion_iva_id);
  perform public._ventas_validar_fecha(p_id, v_f.ambiente, v_f.pto_vta, v_f.cbte_tipo, v_f.concepto, v_f.fecha_cbte);
  if not exists (select 1 from public.ventas_factura_renglones where factura_id = p_id) then
    raise exception 'SIN_RENGLONES' using errcode = 'P0001';
  end if;
  if v_f.imp_total <= 0 then
    raise exception 'TOTAL_CERO' using errcode = 'P0001';
  end if;
  if public._ventas_es_nc(v_f.cbte_tipo) then
    select asociada_id into v_asoc from public.ventas_factura_asociados where factura_id = p_id order by id limit 1;
    perform public._ventas_validar_nc(p_id, v_f.ambiente, v_f.cbte_tipo, v_f.cliente_id, v_asoc, v_f.imp_total, p_forzar, p_user_id);
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);
  begin
    update public.ventas_facturas
       set estado = 'emitiendo',
           rec_razon_social = v_cli.razon_social, rec_doc_tipo = v_cli.doc_tipo, rec_doc_nro = v_cli.doc_nro,
           rec_condicion_iva_id = v_cli.condicion_iva_id, rec_domicilio = v_cli.domicilio,
           numero_intentado = null, resultado = null, observaciones_arca = null, errores_arca = null,
           emitida_por = p_user_id, updated_by = p_user_id
     where id = p_id;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con is distinct from 'ventas_facturas_emision_lock_uidx' then raise; end if;
    select id into v_bloq from public.ventas_facturas
     where ambiente = v_f.ambiente and pto_vta = v_f.pto_vta and cbte_tipo = v_f.cbte_tipo
       and estado in ('emitiendo', 'error_reconciliar') and id <> p_id
     order by id limit 1;
    raise exception 'EMISION_EN_CURSO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'bloqueada_por', v_bloq, 'ambiente', v_f.ambiente,
                                 'pto_vta', v_f.pto_vta, 'cbte_tipo', v_f.cbte_tipo)::text;
  end;

  perform public._ventas_evento(p_id, 'emision_iniciada', 'borrador', 'emitiendo',
                                jsonb_build_object('forzada', coalesce(p_forzar, false)), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);

  select max(numero) into v_ult from public.ventas_facturas
   where ambiente = v_f.ambiente and pto_vta = v_f.pto_vta and cbte_tipo = v_f.cbte_tipo and numero is not null;
  return public._ventas_factura_json(p_id) || jsonb_build_object('ultimo_local', v_ult);
end $$;

-- ── ventas_marcar_intento ─────────────────────────────────────────────
-- Persiste el número que se va a mandar ANTES de llamar a FECAESolicitar.
create or replace function public.ventas_marcar_intento(p_id bigint, p_numero bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f   public.ventas_facturas%rowtype;
  v_ult bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.estado <> 'emitiendo' then
    raise exception 'FACTURA_NO_EMITIENDO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;
  if p_numero is null or p_numero not between 1 and 99999999 then
    raise exception 'NUMERO_INVALIDO' using errcode = 'P0001', detail = json_build_object('numero', p_numero)::text;
  end if;
  select max(numero) into v_ult from public.ventas_facturas
   where ambiente = v_f.ambiente and pto_vta = v_f.pto_vta and cbte_tipo = v_f.cbte_tipo and numero is not null;
  if v_ult is not null and p_numero <= v_ult then
    -- ARCA dice «último = N−1» pero acá ya hay un N o más: la base y ARCA no coinciden.
    raise exception 'NUMERO_DESFASADO' using errcode = 'P0001',
      detail = json_build_object('numero', p_numero, 'ultimo_local', v_ult)::text;
  end if;
  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_facturas
     set numero_intentado = p_numero, intento_at = now(), intento_n = intento_n + 1, updated_by = p_user_id
   where id = p_id;
  perform public._ventas_evento(p_id, 'intento', 'emitiendo', 'emitiendo',
                                jsonb_build_object('numero', p_numero, 'intento_n', v_f.intento_n + 1), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return jsonb_build_object('id', p_id, 'numero_intentado', p_numero, 'intento_n', v_f.intento_n + 1, 'intento_at', now());
end $$;

-- ── ventas_confirmar_emision ──────────────────────────────────────────
-- Resultado de ARCA, en una sola transacción. p_res:
--   { resultado: 'A' | 'R' | 'incierto' (o null),
--     numero, cae, cae_vto ('YYYY-MM-DD'), fecha_cbte (opcional, la de ARCA),
--     observaciones (jsonb), errores (jsonb), error (texto, para incierto) }
-- Acepta desde `emitiendo` y desde `error_reconciliar` (reconciliación que
-- encontró el comprobante en ARCA → resultado A).
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
             fch_vto_pago = case when concepto = 1 then null else coalesce(v_fecha, fecha_cbte) end,
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

  else  -- INCIERTO: no sabemos si ARCA lo autorizó. El talonario queda trabado hasta reconciliar.
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

-- ── ventas_volver_a_borrador ──────────────────────────────────────────
-- rechazada → borrador (para corregir y reintentar).
-- error_reconciliar | emitiendo → borrador SOLO si el backend verificó en ARCA
-- (FECompConsultar / FECompUltimoAutorizado) que el número intentado NO
-- existe: lo prueba pasando p_numero_consultado = numero_intentado. Si ARCA
-- SÍ lo tiene, lo que corresponde es ventas_confirmar_emision con A.
-- Desde `emitiendo` además exige que el intento esté quieto hace 2 minutos
-- (si no, puede haber un request en vuelo).
create or replace function public.ventas_volver_a_borrador(p_id bigint, p_numero_consultado bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f public.ventas_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.estado not in ('rechazada', 'error_reconciliar', 'emitiendo') then
    raise exception 'FACTURA_NO_REVERTIBLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.estado = 'emitiendo' and coalesce(v_f.intento_at, v_f.updated_at) > now() - interval '2 minutes' then
    raise exception 'EMISION_EN_CURSO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'bloqueada_por', p_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.estado in ('error_reconciliar', 'emitiendo') and v_f.numero_intentado is not null
     and p_numero_consultado is distinct from v_f.numero_intentado then
    raise exception 'NUMERO_NO_COINCIDE' using errcode = 'P0001',
      detail = json_build_object('numero_consultado', p_numero_consultado, 'numero_intentado', v_f.numero_intentado)::text;
  end if;
  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_facturas
     set estado = 'borrador', numero_intentado = null, resultado = null, updated_by = p_user_id
   where id = p_id;
  perform public._ventas_evento(p_id, 'vuelta_a_borrador', v_f.estado, 'borrador',
    jsonb_build_object('motivo', p_motivo, 'numero_intentado', v_f.numero_intentado, 'numero_consultado', p_numero_consultado), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_factura_json(p_id);
end $$;

-- ── ventas_descartar ──────────────────────────────────────────────────
-- borrador | rechazada → descartada (queda de historia; un borrador que nunca
-- fue a ARCA también se puede borrar con DELETE).
create or replace function public.ventas_descartar(p_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f public.ventas_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.estado not in ('borrador', 'rechazada') then
    raise exception 'FACTURA_NO_DESCARTABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;
  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_facturas set estado = 'descartada', updated_by = p_user_id where id = p_id;
  perform public._ventas_evento(p_id, 'descartada', v_f.estado, 'descartada', jsonb_build_object('motivo', p_motivo), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_factura_json(p_id);
end $$;

-- ── Finnegans ─────────────────────────────────────────────────────────

create or replace function public.ventas_registrar_finnegans(p_id bigint, p_numero_finnegans text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f    public.ventas_facturas%rowtype;
  v_num  text := nullif(btrim(p_numero_finnegans), '');
  v_otra bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'registrar_finnegans', false) then
    raise exception 'SIN_PERMISO_REGISTRAR' using errcode = 'P0001', detail = json_build_object('flag', 'registrar_finnegans')::text;
  end if;
  if v_num is null then
    raise exception 'NUMERO_FINNEGANS_REQUERIDO' using errcode = 'P0001';
  end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.estado <> 'autorizada' then
    raise exception 'FACTURA_NO_AUTORIZADA' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.numero_finnegans is not null then
    raise exception 'YA_REGISTRADA' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_id, 'numero_finnegans', v_f.numero_finnegans)::text;
  end if;
  select id into v_otra from public.ventas_facturas
   where numero_finnegans is not null and upper(btrim(numero_finnegans)) = upper(v_num) limit 1;
  if v_otra is not null then
    raise exception 'NUMERO_FINNEGANS_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('numero_finnegans', v_num, 'factura_id', v_otra)::text;
  end if;
  begin
    update public.ventas_facturas
       set numero_finnegans = v_num, registrada_at = now(), registrada_por = p_user_id, updated_by = p_user_id
     where id = p_id;
  exception when unique_violation then   -- carrera con otro registro del mismo número
    raise exception 'NUMERO_FINNEGANS_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('numero_finnegans', v_num)::text;
  end;
  perform set_config('cadinc.ventas_rpc', 'on', true);
  perform public._ventas_evento(p_id, 'registrada_finnegans', 'autorizada', 'autorizada',
                                jsonb_build_object('numero_finnegans', v_num), p_user_id);
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return (select to_jsonb(v) from public.v_ventas_facturas v where v.id = p_id);
end $$;

create or replace function public.ventas_deshacer_registro(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f public.ventas_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'registrar_finnegans', false) then
    raise exception 'SIN_PERMISO_REGISTRAR' using errcode = 'P0001', detail = json_build_object('flag', 'registrar_finnegans')::text;
  end if;
  select * into v_f from public.ventas_facturas where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  if v_f.numero_finnegans is null then
    raise exception 'NO_REGISTRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_id)::text;
  end if;
  update public.ventas_facturas
     set numero_finnegans = null, registrada_at = null, registrada_por = null, updated_by = p_user_id
   where id = p_id;
  perform public._ventas_evento(p_id, 'registro_deshecho', v_f.estado, v_f.estado,
                                jsonb_build_object('numero_finnegans', v_f.numero_finnegans), p_user_id);
  return (select to_jsonb(v) from public.v_ventas_facturas v where v.id = p_id);
end $$;

-- ── Token de WSAA ─────────────────────────────────────────────────────
-- Reclamo atómico: devuelve reclamado = true SOLO al proceso que ganó el
-- UPDATE. Los demás esperan y releen arca_tokens. El reclamo vence solo
-- (renovando_hasta) por si el proceso que lo tomó se cae.
create or replace function public.arca_reclamar_renovacion(p_ambiente text, p_servicio text, p_segundos int default 120)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t public.arca_tokens%rowtype;
begin
  if p_ambiente is null or p_ambiente not in ('homo', 'prod') then
    raise exception 'AMBIENTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('ambiente', p_ambiente)::text;
  end if;
  if length(btrim(coalesce(p_servicio, ''))) = 0 then
    raise exception 'SERVICIO_REQUERIDO' using errcode = 'P0001';
  end if;
  if p_segundos is null or p_segundos not between 10 and 600 then
    raise exception 'SEGUNDOS_INVALIDOS' using errcode = 'P0001', detail = json_build_object('segundos', p_segundos)::text;
  end if;
  insert into public.arca_tokens (ambiente, servicio) values (p_ambiente, p_servicio)
  on conflict (ambiente, servicio) do nothing;

  update public.arca_tokens
     set renovando_hasta = now() + make_interval(secs => p_segundos)
   where ambiente = p_ambiente and servicio = p_servicio
     and (renovando_hasta is null or renovando_hasta < now())
  returning * into v_t;
  if found then
    return jsonb_build_object('reclamado', true, 'renovando_hasta', v_t.renovando_hasta, 'expira_at', v_t.expira_at,
                              'vigente', coalesce(v_t.expira_at > now(), false));
  end if;
  select * into v_t from public.arca_tokens where ambiente = p_ambiente and servicio = p_servicio;
  return jsonb_build_object('reclamado', false, 'renovando_hasta', v_t.renovando_hasta, 'expira_at', v_t.expira_at,
                            'vigente', coalesce(v_t.expira_at > now(), false));
end $$;

-- Guarda el TA nuevo y suelta el reclamo.
create or replace function public.arca_guardar_token(p_ambiente text, p_servicio text, p_token text, p_sign text,
                                                     p_generado_at timestamptz, p_expira_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_ambiente is null or p_ambiente not in ('homo', 'prod') then
    raise exception 'AMBIENTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('ambiente', p_ambiente)::text;
  end if;
  if length(btrim(coalesce(p_servicio, ''))) = 0 then
    raise exception 'SERVICIO_REQUERIDO' using errcode = 'P0001';
  end if;
  if coalesce(p_token, '') = '' or coalesce(p_sign, '') = '' or p_expira_at is null
     or (p_generado_at is not null and p_expira_at <= p_generado_at) then
    raise exception 'TA_INVALIDO' using errcode = 'P0001';   -- sin detail: nunca devolver el token
  end if;
  insert into public.arca_tokens (ambiente, servicio, token, sign, generado_at, expira_at, renovando_hasta)
  values (p_ambiente, p_servicio, p_token, p_sign, p_generado_at, p_expira_at, null)
  on conflict (ambiente, servicio) do update
     set token = excluded.token, sign = excluded.sign, generado_at = excluded.generado_at,
         expira_at = excluded.expira_at, renovando_hasta = null;
end $$;

-- Suelta el reclamo sin token nuevo (la renovación falló).
create or replace function public.arca_liberar_renovacion(p_ambiente text, p_servicio text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.arca_tokens set renovando_hasta = null where ambiente = p_ambiente and servicio = p_servicio
$$;

-- ── Grants ────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_cuit_emisor()',
    '_ventas_es_nc(smallint)',
    '_ventas_tipo_factura_de_nc(smallint)',
    '_ventas_validar_receptor(smallint, smallint, smallint)',
    '_ventas_validar_fecha(bigint, text, int, smallint, smallint, date)',
    '_ventas_validar_nc(bigint, text, smallint, bigint, bigint, numeric, boolean, uuid)',
    '_ventas_evento(bigint, text, text, text, jsonb, uuid)',
    '_ventas_factura_json(bigint)',
    'ventas_guardar_borrador(jsonb, jsonb, uuid, boolean)',
    'ventas_iniciar_emision(bigint, text, uuid, boolean)',
    'ventas_marcar_intento(bigint, bigint, uuid)',
    'ventas_confirmar_emision(bigint, jsonb, uuid)',
    'ventas_volver_a_borrador(bigint, bigint, text, uuid)',
    'ventas_descartar(bigint, text, uuid)',
    'ventas_registrar_finnegans(bigint, text, uuid)',
    'ventas_deshacer_registro(bigint, uuid)',
    'arca_reclamar_renovacion(text, text, int)',
    'arca_guardar_token(text, text, text, text, timestamptz, timestamptz)',
    'arca_liberar_renovacion(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
