-- =====================================================================
-- 20260924n — Ventas / Cobranzas: RPCs (2026-09-24)
--
-- Requiere 20260924k/l/m. Mismo molde que 20260924c: SECURITY DEFINER,
-- EXECUTE solo service_role, p_user_id explícito (nunca auth.uid()), errores
-- `raise exception 'CODIGO' using errcode = 'P0001', detail = '<json>'`.
--
--   ventas_registrar_cobro(p_cobro, p_medios, p_retenciones, p_imputaciones, p_user_id)
--   ventas_imputar(p_origen, p_items, p_user_id, p_fecha)        a cuenta después / compensación con NC
--   ventas_anular_cobro(p_id, p_motivo, p_user_id)               anula el cobro y sus imputaciones
--   ventas_anular_imputacion(p_id, p_user_id, p_motivo)
--   ventas_cambiar_vencimiento(p_factura_id, p_vence_el, p_user_id)
--   ventas_externos_marcar(p_ids, p_accion, p_user_id, p_motivo, p_fecha)
--   ventas_importar_externos(p_filas, p_user_id, p_confirmar, p_origen)
--
-- CONCURRENCIA. Toda imputación pasa por `_ventas_aplicar`, que:
--   1. bloquea con FOR UPDATE, SIEMPRE en el mismo orden: ventas_facturas
--      (destinos + la NC de origen + su factura asociada) por id →
--      ventas_comprobantes_externos por id → el cobro de origen. Mismo orden
--      en las anulaciones, así dos operaciones no se cruzan en deadlock.
--   2. recién con los locks tomados recalcula saldos con ventas_saldos_al
--      (fuente única, 20260924m) y valida: cada importe ≤ saldo del destino
--      (IMPUTACION_SUPERA_SALDO) y Σ ≤ disponible del origen
--      (IMPUTACION_SUPERA_COBRO / IMPUTACION_SUPERA_CREDITO). Así nunca queda
--      un saldo < 0.
-- Anular solo SUBE saldos de débitos, así que no necesita más locks que los
-- del cobro/imputación y sus destinos.
--
-- Permisos en la base (defensa en profundidad, espejo de requireFlag):
-- registrar/imputar/compensar = flag registrar_cobros; anular cobro o
-- imputación = flag anular_cobros. Cambiar vencimiento, marcar saldos
-- iniciales e importar no llevan flag: el backend exige actualizacion /
-- creacion + tab saldos_iniciales.
--
-- Numeración del recibo: correlativa por ambiente, sin huecos por rollback
-- (max + 1 bajo pg_advisory_xact_lock, no una secuencia).
-- =====================================================================

-- ── Detalle de un cobro (forma de respuesta común) ────────────────────
create or replace function public._ventas_cobro_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cobro', (select to_jsonb(v) from public.v_ventas_cobros v where v.id = p_id),
    'medios', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object('cuenta_banco', b.banco, 'cuenta_alias', b.alias, 'cuenta_cbu', b.cbu)
                       order by m.orden)
        from public.ventas_cobro_medios m
        left join public.ventas_cuentas_bancarias b on b.id = m.cuenta_bancaria_id
       where m.cobro_id = p_id), '[]'::jsonb),
    'retenciones', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.orden) from public.ventas_cobro_retenciones r where r.cobro_id = p_id), '[]'::jsonb),
    'imputaciones', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.id) from public.v_ventas_imputaciones i where i.cobro_id = p_id), '[]'::jsonb))
$$;

-- aplicado / a_cuenta del cobro desde sus imputaciones vigentes (requiere cadinc.ventas_rpc).
create or replace function public._ventas_cobro_recalcular(p_id bigint) returns void
language sql set search_path = public, pg_temp as $$
  update public.ventas_cobros c
     set aplicado = x.s, a_cuenta = c.total - x.s
    from (select coalesce(sum(i.importe), 0) as s from public.ventas_imputaciones i
           where i.cobro_id = p_id and not i.anulada) x
   where c.id = p_id and c.estado = 'vigente'
$$;

-- ── El núcleo: aplicar un crédito a débitos ───────────────────────────
-- p_origen: 'cobro' | 'nc_factura' | 'nc_externo'. p_items: [{factura_id | externo_id, importe}].
-- Varias filas al mismo destino se suman. Devuelve el total aplicado.
-- Requiere cadinc.ventas_rpc = 'on' (lo setean las RPC públicas).
create or replace function public._ventas_aplicar(p_origen text, p_origen_id bigint, p_items jsonb, p_fecha date, p_user_id uuid)
returns numeric language plpgsql set search_path = public, pg_temp as $$
declare
  v_cli     bigint;
  v_amb     text;
  v_ofecha  date;
  v_asoc    bigint;
  v_f       public.ventas_facturas%rowtype;
  v_x       public.ventas_comprobantes_externos%rowtype;
  v_c       public.ventas_cobros%rowtype;
  v_e       jsonb;
  v_i       bigint;
  v_fid     bigint;
  v_eid     bigint;
  v_imp     numeric(14,2);
  v_fids    bigint[] := '{}';
  v_eids    bigint[] := '{}';
  v_total   numeric(14,2) := 0;
  v_disp    numeric(14,2);
  v_saldo   numeric(14,2);
  v_map     jsonb;
  v_d       record;
begin
  -- 1. Origen (sin lock todavía): cliente, ambiente, fecha.
  if p_origen = 'cobro' then
    select cliente_id, ambiente, fecha into v_cli, v_amb, v_ofecha from public.ventas_cobros where id = p_origen_id;
    if not found then
      raise exception 'COBRO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cobro_id', p_origen_id)::text;
    end if;
  elsif p_origen = 'nc_factura' then
    select * into v_f from public.ventas_facturas where id = p_origen_id;
    if not found then
      raise exception 'ORIGEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('nc_factura_id', p_origen_id)::text;
    end if;
    if v_f.estado <> 'autorizada' or v_f.cbte_tipo not in (3, 8, 203) then
      raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('nc_factura_id', p_origen_id, 'motivo', 'no_es_nc_autorizada',
                                   'estado', v_f.estado, 'cbte_tipo', v_f.cbte_tipo)::text;
    end if;
    v_cli := v_f.cliente_id; v_amb := v_f.ambiente; v_ofecha := v_f.fecha_cbte;
    select asociada_id into v_asoc from public.ventas_factura_asociados where factura_id = p_origen_id order by id limit 1;
  elsif p_origen = 'nc_externo' then
    select * into v_x from public.ventas_comprobantes_externos where id = p_origen_id;
    if not found then
      raise exception 'ORIGEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('nc_externo_id', p_origen_id)::text;
    end if;
    if v_x.tipo <> 'NC' then
      raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('nc_externo_id', p_origen_id, 'motivo', 'no_es_nc', 'cbte_tipo', v_x.cbte_tipo)::text;
    end if;
    v_cli := v_x.cliente_id; v_amb := 'prod'; v_ofecha := v_x.fecha;
  else
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('motivo', 'tipo', 'origen', p_origen)::text;
  end if;

  -- 2. Items: forma.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_IMPUTACIONES' using errcode = 'P0001';
  end if;
  for v_e, v_i in select e, n from jsonb_array_elements(p_items) with ordinality as t(e, n) loop
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'item')::text;
    end if;
    v_fid := nullif(v_e ->> 'factura_id', '')::bigint;
    v_eid := nullif(v_e ->> 'externo_id', '')::bigint;
    if num_nonnulls(v_fid, v_eid) <> 1 then
      raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'destino')::text;
    end if;
    v_imp := round(nullif(v_e ->> 'importe', '')::numeric, 2);
    if v_imp is null or v_imp <= 0 then
      raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', 'importe')::text;
    end if;
    if v_fid is not null then v_fids := v_fids || v_fid; else v_eids := v_eids || v_eid; end if;
    v_total := v_total + v_imp;
  end loop;

  -- 3. Locks, en orden fijo: facturas → externos → cobro.
  perform 1 from public.ventas_facturas
   where id = any (v_fids || case when p_origen = 'nc_factura' then array[p_origen_id, v_asoc] else '{}'::bigint[] end)
   order by id for update;
  perform 1 from public.ventas_comprobantes_externos
   where id = any (v_eids || case when p_origen = 'nc_externo' then array[p_origen_id] else '{}'::bigint[] end)
   order by id for update;
  if p_origen = 'cobro' then
    select * into v_c from public.ventas_cobros where id = p_origen_id for update;
    if v_c.estado <> 'vigente' then
      raise exception 'COBRO_ANULADO' using errcode = 'P0001', detail = json_build_object('cobro_id', p_origen_id)::text;
    end if;
  end if;

  -- 4. Saldos con los locks tomados (una sola pasada de la fuente de verdad).
  select coalesce(jsonb_object_agg(
           case when s.naturaleza = 'debito' and s.factura_id is not null then 'f' || s.factura_id
                when s.naturaleza = 'debito' then 'e' || s.externo_id
                when s.origen = 'erp' then 'nf' || s.factura_id
                when s.origen = 'externo' then 'ne' || s.externo_id
                else 'c' || s.cobro_id end,
           jsonb_build_object('saldo', s.saldo, 'comprobante', s.comprobante)), '{}'::jsonb)
    into v_map
    from public.ventas_saldos_al(null, v_cli, v_amb) s
   where (s.naturaleza = 'debito' and (s.factura_id = any (v_fids) or s.externo_id = any (v_eids)))
      or (s.origen = 'erp' and s.naturaleza = 'credito' and p_origen = 'nc_factura' and s.factura_id = p_origen_id)
      or (s.origen = 'externo' and s.naturaleza = 'credito' and p_origen = 'nc_externo' and s.externo_id = p_origen_id)
      or (s.origen = 'cobro' and p_origen = 'cobro' and s.cobro_id = p_origen_id);

  v_disp := coalesce((v_map -> (case p_origen when 'cobro' then 'c' when 'nc_factura' then 'nf' else 'ne' end || p_origen_id) ->> 'saldo')::numeric, 0);
  if v_total > v_disp then
    if p_origen = 'cobro' then
      raise exception 'IMPUTACION_SUPERA_COBRO' using errcode = 'P0001',
        detail = json_build_object('cobro_id', p_origen_id, 'disponible', v_disp, 'importe', v_total)::text;
    else
      raise exception 'IMPUTACION_SUPERA_CREDITO' using errcode = 'P0001',
        detail = json_build_object(case when p_origen = 'nc_factura' then 'nc_factura_id' else 'nc_externo_id' end, p_origen_id,
                                   'disponible', v_disp, 'importe', v_total)::text;
    end if;
  end if;

  -- 5. Destinos: validar e insertar (sumando filas repetidas).
  for v_d in
    select nullif(e ->> 'factura_id', '')::bigint as fid, nullif(e ->> 'externo_id', '')::bigint as eid,
           sum(round((e ->> 'importe')::numeric, 2)) as imp
      from jsonb_array_elements(p_items) e
     group by 1, 2
     order by 1 nulls last, 2
  loop
    if v_d.fid is not null then
      select * into v_f from public.ventas_facturas where id = v_d.fid;
      if not found then
        raise exception 'DESTINO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', v_d.fid)::text;
      end if;
      if v_f.estado <> 'autorizada' or v_f.cbte_tipo in (3, 8, 203) then
        raise exception 'DESTINO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('factura_id', v_d.fid,
                                     'motivo', case when v_f.estado <> 'autorizada' then 'no_autorizada' else 'es_nota_de_credito' end)::text;
      end if;
      if v_f.ambiente <> v_amb then
        raise exception 'AMBIENTE_NO_COINCIDE' using errcode = 'P0001',
          detail = json_build_object('esperado', v_amb, 'destino', v_f.ambiente, 'factura_id', v_d.fid)::text;
      end if;
      if v_f.cliente_id <> v_cli then
        raise exception 'OTRO_CLIENTE' using errcode = 'P0001',
          detail = json_build_object('factura_id', v_d.fid, 'cliente_destino', v_f.cliente_id, 'cliente_origen', v_cli)::text;
      end if;
      if p_origen = 'nc_factura' and v_d.fid = v_asoc then
        raise exception 'NC_A_SU_FACTURA' using errcode = 'P0001',
          detail = json_build_object('nc_factura_id', p_origen_id, 'factura_id', v_d.fid)::text;
      end if;
      v_saldo := coalesce((v_map -> ('f' || v_d.fid) ->> 'saldo')::numeric, 0);
      if v_d.imp > v_saldo then
        raise exception 'IMPUTACION_SUPERA_SALDO' using errcode = 'P0001',
          detail = json_build_object('destino', json_build_object('factura_id', v_d.fid,
                                                                  'comprobante', v_map -> ('f' || v_d.fid) ->> 'comprobante'),
                                     'saldo', v_saldo, 'importe', v_d.imp)::text;
      end if;
      insert into public.ventas_imputaciones (cobro_id, nc_factura_id, nc_externo_id, factura_id, importe, fecha, created_by)
      values (case when p_origen = 'cobro' then p_origen_id end,
              case when p_origen = 'nc_factura' then p_origen_id end,
              case when p_origen = 'nc_externo' then p_origen_id end,
              v_d.fid, v_d.imp, greatest(p_fecha, v_ofecha, v_f.fecha_cbte), p_user_id);
    else
      select * into v_x from public.ventas_comprobantes_externos where id = v_d.eid;
      if not found then
        raise exception 'DESTINO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('externo_id', v_d.eid)::text;
      end if;
      if v_x.tipo = 'NC' then
        raise exception 'DESTINO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('externo_id', v_d.eid, 'motivo', 'es_nota_de_credito')::text;
      end if;
      if v_amb <> 'prod' then
        raise exception 'AMBIENTE_NO_COINCIDE' using errcode = 'P0001',
          detail = json_build_object('esperado', v_amb, 'destino', 'prod', 'externo_id', v_d.eid)::text;
      end if;
      if v_x.cliente_id <> v_cli then
        raise exception 'OTRO_CLIENTE' using errcode = 'P0001',
          detail = json_build_object('externo_id', v_d.eid, 'cliente_destino', v_x.cliente_id, 'cliente_origen', v_cli)::text;
      end if;
      v_saldo := coalesce((v_map -> ('e' || v_d.eid) ->> 'saldo')::numeric, 0);
      if v_d.imp > v_saldo then
        raise exception 'IMPUTACION_SUPERA_SALDO' using errcode = 'P0001',
          detail = json_build_object('destino', json_build_object('externo_id', v_d.eid,
                                                                  'comprobante', v_map -> ('e' || v_d.eid) ->> 'comprobante'),
                                     'saldo', v_saldo, 'importe', v_d.imp)::text;
      end if;
      insert into public.ventas_imputaciones (cobro_id, nc_factura_id, nc_externo_id, externo_id, importe, fecha, created_by)
      values (case when p_origen = 'cobro' then p_origen_id end,
              case when p_origen = 'nc_factura' then p_origen_id end,
              case when p_origen = 'nc_externo' then p_origen_id end,
              v_d.eid, v_d.imp, greatest(p_fecha, v_ofecha, v_x.fecha), p_user_id);
    end if;
  end loop;

  if p_origen = 'cobro' then
    perform public._ventas_cobro_recalcular(p_origen_id);
  end if;
  return v_total;
end $$;

-- ── ventas_registrar_cobro ────────────────────────────────────────────
-- p_cobro:        { fecha?, cliente_id, obs?, ambiente? ('prod') }
-- p_medios:       [{ forma, importe, cuenta_bancaria_id?, cheque_numero?, cheque_banco?, cheque_librador?,
--                    cheque_fecha_cobro?, obs? }]
-- p_retenciones:  [{ tipo, importe, jurisdiccion?, certificado_numero?, fecha? (= la del cobro), obs?,
--                    adjunto_path?, adjunto_hash?, adjunto_nombre?, adjunto_mime?, adjunto_size? }]
-- p_imputaciones: [{ factura_id | externo_id, importe }]   (puede ir vacío: todo a cuenta)
-- Devuelve _ventas_cobro_json: { cobro, medios, retenciones, imputaciones }.
create or replace function public.ventas_registrar_cobro(p_cobro jsonb, p_medios jsonb, p_retenciones jsonb,
                                                         p_imputaciones jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_amb     text   := coalesce(nullif(btrim(p_cobro ->> 'ambiente'), ''), 'prod');
  v_fecha   date   := coalesce(nullif(p_cobro ->> 'fecha', '')::date, public.hoy_ar());
  v_cli_id  bigint := nullif(p_cobro ->> 'cliente_id', '')::bigint;
  v_cli     public.ventas_clientes%rowtype;
  v_e       jsonb;
  v_i       bigint;
  v_forma   text;
  v_imp     numeric(14,2);
  v_medios  numeric(14,2) := 0;
  v_ret     numeric(14,2) := 0;
  v_total   numeric(14,2);
  v_num     bigint;
  v_id      bigint;
  v_otro    bigint;
  v_campo   text;
  v_tipo    text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'registrar_cobros', false) then
    raise exception 'SIN_PERMISO_COBROS' using errcode = 'P0001', detail = json_build_object('flag', 'registrar_cobros')::text;
  end if;
  if v_amb not in ('homo', 'prod') then
    raise exception 'AMBIENTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('ambiente', v_amb)::text;
  end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  if v_cli_id is null then raise exception 'CLIENTE_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_cli from public.ventas_clientes where id = v_cli_id;
  if not found then
    raise exception 'CLIENTE_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cliente_id', v_cli_id)::text;
  end if;
  if not v_cli.activo then
    raise exception 'CLIENTE_INACTIVO' using errcode = 'P0001', detail = json_build_object('cliente_id', v_cli_id)::text;
  end if;

  -- Medios.
  if p_medios is not null and jsonb_typeof(p_medios) <> 'array' then
    raise exception 'MEDIO_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', null, 'campo', 'medios')::text;
  end if;
  for v_e, v_i in select e, n from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) with ordinality as t(e, n) loop
    v_forma := lower(btrim(coalesce(v_e ->> 'forma', '')));
    v_campo := null;
    if v_forma not in ('transferencia', 'cheque', 'echeq', 'efectivo', 'otro') then v_campo := 'forma';
    elsif coalesce(round(nullif(v_e ->> 'importe', '')::numeric, 2), 0) <= 0 then v_campo := 'importe';
    elsif v_forma = 'transferencia' and not exists (
            select 1 from public.ventas_cuentas_bancarias b
             where b.id = nullif(v_e ->> 'cuenta_bancaria_id', '')::bigint and b.activo) then v_campo := 'cuenta_bancaria_id';
    elsif nullif(v_e ->> 'cuenta_bancaria_id', '') is not null and not exists (
            select 1 from public.ventas_cuentas_bancarias b where b.id = (v_e ->> 'cuenta_bancaria_id')::bigint) then v_campo := 'cuenta_bancaria_id';
    elsif v_forma in ('cheque', 'echeq') then
      v_campo := case when length(btrim(coalesce(v_e ->> 'cheque_numero', ''))) = 0 then 'cheque_numero'
                      when length(btrim(coalesce(v_e ->> 'cheque_banco', ''))) = 0 then 'cheque_banco'
                      when length(btrim(coalesce(v_e ->> 'cheque_librador', ''))) = 0 then 'cheque_librador'
                      when nullif(v_e ->> 'cheque_fecha_cobro', '') is null then 'cheque_fecha_cobro' end;
    end if;
    if v_campo is not null then
      raise exception 'MEDIO_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', v_campo)::text;
    end if;
    if v_forma in ('cheque', 'echeq') then
      select m.cobro_id into v_otro
        from public.ventas_cobro_medios m join public.ventas_cobros c on c.id = m.cobro_id
       where c.estado = 'vigente' and m.forma in ('cheque', 'echeq')
         and upper(btrim(m.cheque_numero)) = upper(btrim(v_e ->> 'cheque_numero'))
         and upper(btrim(m.cheque_banco)) = upper(btrim(v_e ->> 'cheque_banco'))
       limit 1;
      if v_otro is not null then
        raise exception 'CHEQUE_DUPLICADO' using errcode = 'P0001',
          detail = json_build_object('indice', v_i, 'cheque_numero', btrim(v_e ->> 'cheque_numero'), 'cobro_id', v_otro)::text;
      end if;
    end if;
    v_medios := v_medios + round((v_e ->> 'importe')::numeric, 2);
  end loop;

  -- Retenciones.
  if p_retenciones is not null and jsonb_typeof(p_retenciones) <> 'array' then
    raise exception 'RETENCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', null, 'campo', 'retenciones')::text;
  end if;
  for v_e, v_i in select e, n from jsonb_array_elements(coalesce(p_retenciones, '[]'::jsonb)) with ordinality as t(e, n) loop
    v_tipo := lower(btrim(coalesce(v_e ->> 'tipo', '')));
    v_campo := case
      when v_tipo not in ('iibb', 'tem', 'suss', 'ganancias', 'iva', 'otra') then 'tipo'
      when coalesce(round(nullif(v_e ->> 'importe', '')::numeric, 2), 0) <= 0 then 'importe'
      when nullif(v_e ->> 'fecha', '') is not null and (v_e ->> 'fecha')::date > public.hoy_ar() then 'fecha'
      when (nullif(v_e ->> 'adjunto_path', '') is null) <> (nullif(v_e ->> 'adjunto_hash', '') is null) then 'adjunto'
      when nullif(v_e ->> 'adjunto_hash', '') is not null and (v_e ->> 'adjunto_hash') !~ '^[0-9a-f]{64}$' then 'adjunto_hash'
    end;
    if v_campo is not null then
      raise exception 'RETENCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', v_campo)::text;
    end if;
    if length(btrim(coalesce(v_e ->> 'certificado_numero', ''))) > 0 then
      select r.cobro_id into v_otro
        from public.ventas_cobro_retenciones r join public.ventas_cobros c on c.id = r.cobro_id
       where c.estado = 'vigente' and c.cliente_id = v_cli_id and r.tipo = v_tipo
         and upper(btrim(r.certificado_numero)) = upper(btrim(v_e ->> 'certificado_numero'))
       limit 1;
      if v_otro is not null then
        raise exception 'RETENCION_DUPLICADA' using errcode = 'P0001',
          detail = json_build_object('indice', v_i, 'tipo', v_tipo, 'certificado_numero', btrim(v_e ->> 'certificado_numero'),
                                     'cobro_id', v_otro)::text;
      end if;
    end if;
    v_ret := v_ret + round((v_e ->> 'importe')::numeric, 2);
  end loop;

  v_total := v_medios + v_ret;
  if v_total <= 0 then
    raise exception 'COBRO_TOTAL_CERO' using errcode = 'P0001';
  end if;
  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) <> 'array' then
    raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('indice', null, 'campo', 'imputaciones')::text;
  end if;

  -- Número de recibo: correlativo por ambiente.
  perform pg_advisory_xact_lock(hashtext('ventas_cobros_numero:' || v_amb));
  select coalesce(max(numero), 0) + 1 into v_num from public.ventas_cobros where ambiente = v_amb;

  perform set_config('cadinc.ventas_rpc', 'on', true);
  insert into public.ventas_cobros (ambiente, numero, fecha, cliente_id, total_medios, total_retenciones, total,
                                    aplicado, a_cuenta, obs, created_by, updated_by)
  values (v_amb, v_num, v_fecha, v_cli_id, v_medios, v_ret, v_total, 0, v_total,
          coalesce(btrim(p_cobro ->> 'obs'), ''), p_user_id, p_user_id)
  returning id into v_id;

  insert into public.ventas_cobro_medios (cobro_id, orden, forma, importe, cuenta_bancaria_id, cheque_numero, cheque_banco,
                                          cheque_librador, cheque_fecha_cobro, obs)
  select v_id, n::smallint, lower(btrim(e ->> 'forma')), round((e ->> 'importe')::numeric, 2),
         nullif(e ->> 'cuenta_bancaria_id', '')::bigint,
         nullif(btrim(e ->> 'cheque_numero'), ''), nullif(btrim(e ->> 'cheque_banco'), ''),
         nullif(btrim(e ->> 'cheque_librador'), ''), nullif(e ->> 'cheque_fecha_cobro', '')::date,
         coalesce(btrim(e ->> 'obs'), '')
    from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) with ordinality as t(e, n);

  insert into public.ventas_cobro_retenciones (cobro_id, orden, tipo, jurisdiccion, certificado_numero, fecha, importe,
                                               adjunto_path, adjunto_nombre, adjunto_hash, adjunto_mime, adjunto_size,
                                               obs, updated_by)
  select v_id, n::smallint, lower(btrim(e ->> 'tipo')), coalesce(btrim(e ->> 'jurisdiccion'), ''),
         coalesce(btrim(e ->> 'certificado_numero'), ''), coalesce(nullif(e ->> 'fecha', '')::date, v_fecha),
         round((e ->> 'importe')::numeric, 2),
         nullif(e ->> 'adjunto_path', ''), nullif(e ->> 'adjunto_nombre', ''), nullif(e ->> 'adjunto_hash', ''),
         nullif(e ->> 'adjunto_mime', ''), nullif(e ->> 'adjunto_size', '')::bigint,
         coalesce(btrim(e ->> 'obs'), ''), p_user_id
    from jsonb_array_elements(coalesce(p_retenciones, '[]'::jsonb)) with ordinality as t(e, n);

  if p_imputaciones is not null and jsonb_array_length(p_imputaciones) > 0 then
    perform public._ventas_aplicar('cobro', v_id, p_imputaciones, v_fecha, p_user_id);
  end if;

  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_cobro_json(v_id);
end $$;

-- ── ventas_imputar ────────────────────────────────────────────────────
-- Aplicar después lo que quedó a cuenta de un cobro, o compensar una NC.
-- p_origen: { cobro_id } | { nc_factura_id } | { nc_externo_id }   (exactamente uno)
-- p_items:  [{ factura_id | externo_id, importe }]
-- p_fecha:  fecha de la imputación (default hoy; nunca antes del origen ni del destino).
-- Devuelve: cobro → _ventas_cobro_json; NC → { credito: <fila de ventas_saldos_al>, imputaciones: [v_ventas_imputaciones vigentes de la NC] }.
create or replace function public.ventas_imputar(p_origen jsonb, p_items jsonb, p_user_id uuid, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cobro bigint := nullif(p_origen ->> 'cobro_id', '')::bigint;
  v_ncf   bigint := nullif(p_origen ->> 'nc_factura_id', '')::bigint;
  v_nce   bigint := nullif(p_origen ->> 'nc_externo_id', '')::bigint;
  v_fecha date   := coalesce(p_fecha, public.hoy_ar());
  v_cli   bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'registrar_cobros', false) then
    raise exception 'SIN_PERMISO_COBROS' using errcode = 'P0001', detail = json_build_object('flag', 'registrar_cobros')::text;
  end if;
  if num_nonnulls(v_cobro, v_ncf, v_nce) <> 1 then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('motivo', 'uno_solo')::text;
  end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);
  if v_cobro is not null then
    perform public._ventas_aplicar('cobro', v_cobro, p_items, v_fecha, p_user_id);
  elsif v_ncf is not null then
    perform public._ventas_aplicar('nc_factura', v_ncf, p_items, v_fecha, p_user_id);
  else
    perform public._ventas_aplicar('nc_externo', v_nce, p_items, v_fecha, p_user_id);
  end if;
  perform set_config('cadinc.ventas_rpc', 'off', true);

  if v_cobro is not null then
    return public._ventas_cobro_json(v_cobro);
  end if;
  select coalesce(f.cliente_id, e.cliente_id) into v_cli
    from (select 1) d
    left join public.ventas_facturas f on f.id = v_ncf
    left join public.ventas_comprobantes_externos e on e.id = v_nce;
  return jsonb_build_object(
    'credito', (select to_jsonb(s) from public.ventas_saldos_al(null, v_cli, null) s
                 where s.naturaleza = 'credito'
                   and ((v_ncf is not null and s.origen = 'erp' and s.factura_id = v_ncf)
                     or (v_nce is not null and s.origen = 'externo' and s.externo_id = v_nce))),
    'imputaciones', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.v_ventas_imputaciones i
                               where not i.anulada and (i.nc_factura_id = v_ncf or i.nc_externo_id = v_nce)), '[]'::jsonb));
end $$;

-- ── ventas_anular_cobro ───────────────────────────────────────────────
-- Anula el cobro y TODAS sus imputaciones vigentes. No borra nada.
create or replace function public.ventas_anular_cobro(p_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c      public.ventas_cobros%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'anular_cobros', false) then
    raise exception 'SIN_PERMISO_ANULAR' using errcode = 'P0001', detail = json_build_object('flag', 'anular_cobros')::text;
  end if;
  if v_motivo is null then raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ventas_cobros where id = p_id) then
    raise exception 'COBRO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cobro_id', p_id)::text;
  end if;

  -- Mismo orden de locks que _ventas_aplicar: facturas → externos → cobro.
  perform 1 from public.ventas_facturas
   where id in (select factura_id from public.ventas_imputaciones where cobro_id = p_id and not anulada)
   order by id for update;
  perform 1 from public.ventas_comprobantes_externos
   where id in (select externo_id from public.ventas_imputaciones where cobro_id = p_id and not anulada)
   order by id for update;
  select * into v_c from public.ventas_cobros where id = p_id for update;
  if v_c.estado = 'anulado' then
    raise exception 'COBRO_YA_ANULADO' using errcode = 'P0001',
      detail = json_build_object('cobro_id', p_id, 'anulado_el', v_c.anulado_el)::text;
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_imputaciones
     set anulada = true, anulada_por = p_user_id, anulada_el = now(), anulada_motivo = 'Cobro anulado: ' || v_motivo
   where cobro_id = p_id and not anulada;
  update public.ventas_cobros
     set estado = 'anulado', anulado_motivo = v_motivo, anulado_por = p_user_id, anulado_el = now(),
         aplicado = 0, a_cuenta = total, updated_by = p_user_id
   where id = p_id;
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return public._ventas_cobro_json(p_id);
end $$;

-- ── ventas_anular_imputacion ──────────────────────────────────────────
-- Devuelve { imputacion: <v_ventas_imputaciones>, cobro?: _ventas_cobro_json (si el origen es un cobro) }.
create or replace function public.ventas_anular_imputacion(p_id bigint, p_user_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_im   public.ventas_imputaciones%rowtype;
  v_asoc bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'anular_cobros', false) then
    raise exception 'SIN_PERMISO_ANULAR' using errcode = 'P0001', detail = json_build_object('flag', 'anular_cobros')::text;
  end if;
  select * into v_im from public.ventas_imputaciones where id = p_id;
  if not found then
    raise exception 'IMPUTACION_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('imputacion_id', p_id)::text;
  end if;
  if v_im.nc_factura_id is not null then
    select asociada_id into v_asoc from public.ventas_factura_asociados where factura_id = v_im.nc_factura_id order by id limit 1;
  end if;

  perform 1 from public.ventas_facturas
   where id = any (array[v_im.factura_id, v_im.nc_factura_id, v_asoc]) order by id for update;
  perform 1 from public.ventas_comprobantes_externos
   where id = any (array[v_im.externo_id, v_im.nc_externo_id]) order by id for update;
  if v_im.cobro_id is not null then
    perform 1 from public.ventas_cobros where id = v_im.cobro_id for update;
  end if;
  select * into v_im from public.ventas_imputaciones where id = p_id for update;
  if v_im.anulada then
    raise exception 'IMPUTACION_YA_ANULADA' using errcode = 'P0001',
      detail = json_build_object('imputacion_id', p_id, 'anulada_el', v_im.anulada_el)::text;
  end if;

  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_imputaciones
     set anulada = true, anulada_por = p_user_id, anulada_el = now(),
         anulada_motivo = coalesce(nullif(btrim(p_motivo), ''), 'Imputación anulada')
   where id = p_id;
  if v_im.cobro_id is not null then
    perform public._ventas_cobro_recalcular(v_im.cobro_id);
  end if;
  perform set_config('cadinc.ventas_rpc', 'off', true);

  return jsonb_build_object('imputacion', (select to_jsonb(i) from public.v_ventas_imputaciones i where i.id = p_id))
         || case when v_im.cobro_id is not null
                 then jsonb_build_object('cobro', public._ventas_cobro_json(v_im.cobro_id)) else '{}'::jsonb end;
end $$;

-- ── ventas_cambiar_vencimiento ────────────────────────────────────────
-- Vencimiento de COBRO (no fiscal). Borrador, rechazada o autorizada; nunca en
-- una NC. En la FCE todavía no autorizada manda fch_vto_pago (se edita en el
-- borrador). p_vence_el NULL = volver al automático (fecha + plazo del
-- cliente; FCE: fch_vto_pago). Devuelve la fila de v_ventas_facturas.
create or replace function public.ventas_cambiar_vencimiento(p_factura_id bigint, p_vence_el date, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f     public.ventas_facturas%rowtype;
  v_nuevo date;
  v_plazo int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.ventas_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.cbte_tipo in (3, 8, 203) then
    raise exception 'VENCE_NO_APLICA_A_NC' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado not in ('borrador', 'rechazada', 'autorizada') then
    raise exception 'VENCIMIENTO_NO_EDITABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.cbte_tipo = 201 and v_f.estado <> 'autorizada' then
    raise exception 'VENCE_ES_EL_DE_LA_FCE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'fch_vto_pago', v_f.fch_vto_pago)::text;
  end if;
  if p_vence_el is null then
    select plazo_pago_dias into v_plazo from public.ventas_clientes where id = v_f.cliente_id;
    v_nuevo := case when v_f.cbte_tipo = 201 then coalesce(v_f.fch_vto_pago, v_f.fecha_cbte)
                    else v_f.fecha_cbte + coalesce(v_plazo, 30) end;
  else
    v_nuevo := p_vence_el;
  end if;
  if v_nuevo < v_f.fecha_cbte then
    raise exception 'VENCE_ANTERIOR_A_FECHA' using errcode = 'P0001',
      detail = json_build_object('vence_el', v_nuevo, 'fecha_cbte', v_f.fecha_cbte)::text;
  end if;

  perform set_config('cadinc.ventas_vencimiento', 'on', true);
  update public.ventas_facturas
     set vence_el = v_nuevo, vence_el_manual = (p_vence_el is not null), updated_by = p_user_id
   where id = p_factura_id;
  perform set_config('cadinc.ventas_vencimiento', 'off', true);
  perform public._ventas_evento(p_factura_id, 'vencimiento_cambiado', v_f.estado, v_f.estado,
    jsonb_build_object('antes', v_f.vence_el, 'despues', v_nuevo, 'manual', p_vence_el is not null), p_user_id);
  return (select to_jsonb(v) from public.v_ventas_facturas v where v.id = p_factura_id);
end $$;

-- ── ventas_externos_marcar ────────────────────────────────────────────
-- Acción masiva de «Saldos iniciales» sobre externos:
--   'cobrada' → saldo_inicial = 0, saldo_cobrado_el = p_fecha (default hoy), motivo default 'saldo inicial'.
--   'impaga'  → saldo_inicial = total (se confirma que se debe entero).
--   'revisar' → vuelve a «a revisar» sin tocar el saldo.
-- 'cobrada' e 'impaga' dejan saldo_a_revisar = false y firman saldo_confirmado_por/el.
-- Devuelve { actualizados, externos: [v_ventas_externos] }.
create or replace function public.ventas_externos_marcar(p_ids bigint[], p_accion text, p_user_id uuid,
                                                         p_motivo text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_acc   text := lower(btrim(coalesce(p_accion, '')));
  v_falta bigint[];
  v_n     int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if v_acc not in ('cobrada', 'impaga', 'revisar') then
    raise exception 'ACCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('accion', p_accion)::text;
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'SIN_IDS' using errcode = 'P0001'; end if;
  if coalesce(p_fecha, public.hoy_ar()) > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', p_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  select array_agg(x) into v_falta from unnest(p_ids) x
   where not exists (select 1 from public.ventas_comprobantes_externos e where e.id = x);
  if v_falta is not null then
    raise exception 'EXTERNO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('ids', v_falta)::text;
  end if;

  perform 1 from public.ventas_comprobantes_externos where id = any (p_ids) order by id for update;
  update public.ventas_comprobantes_externos e
     set saldo_inicial        = case v_acc when 'cobrada' then 0 when 'impaga' then e.total else e.saldo_inicial end,
         saldo_cobrado_el     = case v_acc when 'cobrada' then coalesce(p_fecha, public.hoy_ar())
                                           when 'impaga' then null else e.saldo_cobrado_el end,
         saldo_a_revisar      = (v_acc = 'revisar'),
         saldo_confirmado_por = case when v_acc = 'revisar' then null else p_user_id end,
         saldo_confirmado_el  = case when v_acc = 'revisar' then null else now() end,
         saldo_motivo         = coalesce(nullif(btrim(p_motivo), ''),
                                         case v_acc when 'cobrada' then 'saldo inicial' else e.saldo_motivo end),
         updated_by           = p_user_id
   where e.id = any (p_ids);
  get diagnostics v_n = row_count;
  return jsonb_build_object('actualizados', v_n,
    'externos', coalesce((select jsonb_agg(to_jsonb(v) order by v.fecha, v.id) from public.v_ventas_externos v where v.id = any (p_ids)), '[]'::jsonb));
end $$;

-- ── ventas_importar_externos ──────────────────────────────────────────
-- Importa «Mis Comprobantes — Emitidos» de ARCA (o un CSV equivalente) ya
-- parseado a filas JSON por el backend/frontend. TODO O NADA.
--   p_filas: [{ cbte_tipo (1 | "1 - Factura A"), pto_vta, numero, fecha ('YYYY-MM-DD' o 'dd/mm/aaaa'),
--               rec_doc_tipo (80 | 'CUIT' | 'CUIL' | 'DNI' | 99), rec_doc_nro, rec_razon_social,
--               neto?, no_gravado?, exento?, iva?, total, moneda?, tipo_cambio?,
--               saldo? (si viene, manda), vence_el?, obs? }]
--   p_confirmar = false → vista previa (no escribe nada). true → inserta las
--   nuevas y crea los clientes que falten; si hay UNA fila con error no
--   escribe nada y sale IMPORTACION_CON_ERRORES { errores: [...] }.
-- Por fila: estado 'nueva' | 'duplicada' (ya está como externo, como
-- comprobante del ERP o repetida en el archivo) | 'error' (error + detalle).
-- Cliente: por número de documento contra ventas_clientes (activo primero).
-- Si no existe se crea: razón social del archivo, condición IVA por letra
-- (A → 1 RI; B → 5 CF, y si trae CUIT queda `revisar_condicion_iva`).
-- Saldo inicial:
--   · con `saldo` en la fila → ese, confirmado;
--   · débito con cobro de Logística (cobros.factura_nro normalizado a PV +
--     número: "2-1143", "00002-00001173", "Factura 00002-….pdf"):
--       cobrado → 0 (saldo_cobrado_el = cobros.cobrado_en), pendiente → total;
--   · el resto → total y saldo_a_revisar = true.
-- vence_el: el de la fila, o fecha + plazo del cliente (30 si es nuevo).
create or replace function public.ventas_importar_externos(p_filas jsonb, p_user_id uuid, p_confirmar boolean default false,
                                                           p_origen text default 'portal')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_origen   text := coalesce(nullif(btrim(p_origen), ''), 'portal');
  v_e        jsonb;
  v_i        bigint;
  v_res      jsonb := '[]'::jsonb;
  v_row      jsonb;
  v_err      text;
  v_det      jsonb;
  v_tipo     smallint;
  v_pv       int;
  v_num      bigint;
  v_fecha    date;
  v_vence    date;
  v_total    numeric(14,2);
  v_saldo    numeric(14,2);
  v_revisar  boolean;
  v_motivo   text;
  v_cobrado  date;
  v_doc_tipo smallint;
  v_doc_nro  text;
  v_rs       text;
  v_letra    text;
  v_cli      bigint;
  v_plazo    int;
  v_nuevo    boolean;
  v_log      record;
  v_vistos   text[] := '{}';
  v_key      text;
  v_ext      bigint;
  v_nuevas   int := 0;
  v_dups     int := 0;
  v_errs     int := 0;
  v_clis     jsonb := '{}'::jsonb;     -- doc_nro → {cliente_id, razon_social, condicion_iva_id, revisar_condicion_iva}
  v_cond     smallint;
  v_txt      text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if v_origen not in ('finnegans', 'portal', 'otro') then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('origen', p_origen)::text;
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 2000)::text;
  end if;

  if p_confirmar then
    perform pg_advisory_xact_lock(hashtext('ventas_importar_externos'));
  end if;

  for v_e, v_i in select e, n from jsonb_array_elements(p_filas) with ordinality as t(e, n) loop
    v_err := null; v_det := null; v_cli := null; v_nuevo := false; v_ext := null; v_cobrado := null;
    v_motivo := ''; v_revisar := false; v_tipo := null; v_pv := null; v_num := null; v_fecha := null;
    v_vence := null; v_total := null; v_saldo := null; v_doc_tipo := null; v_doc_nro := null; v_rs := null; v_plazo := null;
    begin
      -- Tipo: número o "1 - Factura A".
      v_txt  := coalesce(v_e ->> 'cbte_tipo', v_e ->> 'tipo', '');
      v_tipo := nullif(substring(v_txt from '^\s*(\d+)'), '')::smallint;
      if v_tipo is null or v_tipo not in (1, 2, 3, 6, 7, 8, 60, 61, 201, 202, 203) then
        v_err := 'TIPO_INVALIDO'; v_det := jsonb_build_object('cbte_tipo', v_txt);
      end if;
      if v_err is null then
        v_pv  := nullif(regexp_replace(coalesce(v_e ->> 'pto_vta', ''), '\D', '', 'g'), '')::int;
        v_num := nullif(regexp_replace(coalesce(v_e ->> 'numero', v_e ->> 'numero_desde', ''), '\D', '', 'g'), '')::bigint;
        if v_pv is null or v_pv not between 0 and 99999 then
          v_err := 'PTO_VTA_INVALIDO'; v_det := jsonb_build_object('pto_vta', v_e -> 'pto_vta');
        elsif v_num is null or v_num not between 1 and 99999999 then
          v_err := 'NUMERO_INVALIDO'; v_det := jsonb_build_object('numero', coalesce(v_e -> 'numero', v_e -> 'numero_desde'));
        end if;
      end if;
      if v_err is null then
        v_txt := btrim(coalesce(v_e ->> 'fecha', ''));
        v_fecha := case when v_txt ~ '^\d{4}-\d{2}-\d{2}' then substring(v_txt, 1, 10)::date
                        when v_txt ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(v_txt, 'DD/MM/YYYY') end;
        if v_fecha is null or v_fecha > public.hoy_ar() then
          v_err := 'FECHA_INVALIDA'; v_det := jsonb_build_object('fecha', v_txt);
        end if;
      end if;
      if v_err is null then
        v_total := round(nullif(replace(coalesce(v_e ->> 'total', ''), ',', '.'), '')::numeric, 2);
        if v_total is null or v_total <= 0 then
          v_err := 'TOTAL_INVALIDO'; v_det := jsonb_build_object('total', v_e -> 'total');
        end if;
      end if;
      -- Comprador.
      if v_err is null then
        v_txt := upper(btrim(coalesce(v_e ->> 'rec_doc_tipo', '')));
        v_doc_tipo := case when v_txt ~ '^\d+$' then v_txt::smallint
                           when v_txt like 'CUIT%' then 80 when v_txt like 'CUIL%' then 86
                           when v_txt like 'DNI%' then 96 when v_txt = '' then null else -1 end;
        v_doc_nro := nullif(regexp_replace(coalesce(v_e ->> 'rec_doc_nro', ''), '\D', '', 'g'), '');
        v_rs := nullif(btrim(coalesce(v_e ->> 'rec_razon_social', '')), '');
        if v_doc_tipo is null then v_doc_tipo := case when length(coalesce(v_doc_nro, '')) = 11 then 80 else 96 end; end if;
        if v_doc_tipo not in (80, 86, 96, 99) then
          v_err := 'DOC_TIPO_INVALIDO'; v_det := jsonb_build_object('rec_doc_tipo', v_e -> 'rec_doc_tipo');
        elsif v_doc_tipo <> 99 and (v_doc_nro is null or length(v_doc_nro) > 11
                                    or (v_doc_tipo in (80, 86) and length(v_doc_nro) <> 11)) then
          v_err := 'DOC_NRO_INVALIDO'; v_det := jsonb_build_object('rec_doc_nro', v_e -> 'rec_doc_nro');
        end if;
      end if;
      -- Duplicados.
      if v_err is null then
        v_key := v_tipo || '-' || v_pv || '-' || v_num;
        if v_key = any (v_vistos) then
          v_err := 'DUPLICADA'; v_det := jsonb_build_object('motivo', 'repetida_en_el_archivo');
        elsif exists (select 1 from public.ventas_comprobantes_externos x
                       where x.cbte_tipo = v_tipo and x.pto_vta = v_pv and x.numero = v_num) then
          v_err := 'DUPLICADA'; v_det := jsonb_build_object('motivo', 'ya_importada');
        elsif exists (select 1 from public.ventas_facturas f
                       where f.ambiente = 'prod' and f.estado = 'autorizada' and f.cbte_tipo = v_tipo
                         and f.pto_vta = v_pv and f.numero = v_num) then
          v_err := 'DUPLICADA'; v_det := jsonb_build_object('motivo', 'emitida_por_el_erp');
        end if;
        v_vistos := v_vistos || v_key;
      end if;
      -- Cliente.
      if v_err is null then
        v_letra := case when v_tipo in (6, 7, 8, 61) then 'B' else 'A' end;
        if v_doc_tipo = 99 then v_doc_nro := '0'; end if;
        select c.id, c.plazo_pago_dias into v_cli, v_plazo
          from public.ventas_clientes c
         where c.doc_nro = v_doc_nro and (v_doc_tipo = 99) = (c.doc_tipo = 99)
         order by c.activo desc, c.id limit 1;
        if v_cli is null then
          v_cli := nullif(v_clis -> v_doc_nro ->> 'cliente_id', '')::bigint;   -- creado por una fila anterior
          v_plazo := 30;
          v_nuevo := true;
          if v_cli is null and not (v_clis ? v_doc_nro) then
            if v_rs is null or length(v_rs) < 2 then
              v_err := 'RAZON_SOCIAL_REQUERIDA'; v_det := jsonb_build_object('rec_doc_nro', v_doc_nro);
            else
              v_cond := case when v_letra = 'A' then 1 else 5 end;
              if p_confirmar then
                insert into public.ventas_clientes (razon_social, doc_tipo, doc_nro, condicion_iva_id, obs, created_by, updated_by)
                values (v_rs, v_doc_tipo, v_doc_nro, v_cond,
                        'Alta automática del importador de ARCA (20260924n).'
                          || case when v_letra = 'B' and v_doc_tipo in (80, 86) then ' Revisar condición IVA: vino con CUIT en una B.' else '' end,
                        p_user_id, p_user_id)
                returning id into v_cli;
              end if;
              v_clis := v_clis || jsonb_build_object(v_doc_nro, jsonb_build_object(
                          'cliente_id', v_cli, 'razon_social', v_rs, 'doc_tipo', v_doc_tipo, 'doc_nro', v_doc_nro,
                          'condicion_iva_id', v_cond, 'revisar_condicion_iva', v_letra = 'B' and v_doc_tipo in (80, 86)));
            end if;
          end if;
        end if;
      end if;
      -- Saldo y vencimiento.
      if v_err is null then
        if nullif(v_e ->> 'saldo', '') is not null then
          v_saldo := round(replace(v_e ->> 'saldo', ',', '.')::numeric, 2);
          if v_saldo < 0 or v_saldo > v_total then
            v_err := 'SALDO_INVALIDO'; v_det := jsonb_build_object('saldo', v_e -> 'saldo', 'total', v_total);
          else
            v_motivo := 'importado con saldo';
          end if;
        elsif v_tipo not in (3, 8, 203) then
          select c.id, c.estado, c.cobrado_en into v_log
            from public.cobros c
           where (regexp_match(c.factura_nro, '(\d{1,5})\s*-\s*(\d{1,8})'))[1]::int = v_pv
             and (regexp_match(c.factura_nro, '(\d{1,5})\s*-\s*(\d{1,8})'))[2]::bigint = v_num
           order by (c.estado = 'pendiente') desc, c.id desc limit 1;
          if found then
            if v_log.estado = 'cobrado' then
              v_saldo := 0; v_cobrado := coalesce(v_log.cobrado_en, v_fecha);
              v_motivo := 'Logística: cobro #' || v_log.id || ' cobrado';
            else
              v_saldo := v_total;
              v_motivo := 'Logística: cobro #' || v_log.id || ' ' || coalesce(v_log.estado, 'sin estado');
            end if;
          else
            v_saldo := v_total; v_revisar := true;
          end if;
        else
          v_saldo := v_total; v_revisar := true;
        end if;
        v_vence := coalesce(nullif(v_e ->> 'vence_el', '')::date, v_fecha + coalesce(v_plazo, 30));
        if v_err is null and v_vence < v_fecha then
          v_err := 'VENCE_ANTERIOR_A_FECHA'; v_det := jsonb_build_object('vence_el', v_vence, 'fecha', v_fecha);
        end if;
      end if;
    exception when others then
      v_err := 'FILA_INVALIDA'; v_det := jsonb_build_object('sqlstate', sqlstate, 'mensaje', sqlerrm);
    end;

    if v_err is null and p_confirmar then
      insert into public.ventas_comprobantes_externos (
        cliente_id, cbte_tipo, pto_vta, numero, fecha, vence_el,
        neto, no_gravado, exento, iva, total, moneda, tipo_cambio,
        rec_doc_tipo, rec_doc_nro, rec_razon_social,
        saldo_inicial, saldo_a_revisar, saldo_motivo, saldo_cobrado_el,
        saldo_confirmado_por, saldo_confirmado_el, origen, obs, created_by, updated_by)
      values (
        v_cli, v_tipo, v_pv, v_num, v_fecha, v_vence,
        coalesce(round(nullif(replace(v_e ->> 'neto', ',', '.'), '')::numeric, 2), 0),
        coalesce(round(nullif(replace(v_e ->> 'no_gravado', ',', '.'), '')::numeric, 2), 0),
        coalesce(round(nullif(replace(v_e ->> 'exento', ',', '.'), '')::numeric, 2), 0),
        coalesce(round(nullif(replace(v_e ->> 'iva', ',', '.'), '')::numeric, 2), 0),
        v_total,
        coalesce(nullif(upper(btrim(v_e ->> 'moneda')), ''), 'PES'),
        coalesce(nullif(replace(v_e ->> 'tipo_cambio', ',', '.'), '')::numeric, 1),
        v_doc_tipo, v_doc_nro, v_rs,
        v_saldo, v_revisar, v_motivo, v_cobrado,
        case when v_revisar then null else p_user_id end, case when v_revisar then null else now() end,
        v_origen, coalesce(btrim(v_e ->> 'obs'), ''), p_user_id, p_user_id)
      returning id into v_ext;
    end if;

    if v_err is null then
      v_nuevas := v_nuevas + 1;
    elsif v_err = 'DUPLICADA' then
      v_dups := v_dups + 1;
    else
      v_errs := v_errs + 1;
    end if;
    v_row := jsonb_build_object(
      'indice', v_i,
      'estado', case when v_err is null then 'nueva' when v_err = 'DUPLICADA' then 'duplicada' else 'error' end,
      'error', case when v_err = 'DUPLICADA' then null else v_err end,
      'detalle', v_det,
      'cbte_tipo', v_tipo, 'pto_vta', v_pv, 'numero', v_num, 'fecha', v_fecha, 'vence_el', v_vence, 'total', v_total,
      'cliente_id', v_cli, 'cliente_nuevo', v_nuevo, 'rec_doc_nro', v_doc_nro, 'rec_razon_social', v_rs,
      'saldo_inicial', case when v_err is null then v_saldo end,
      'saldo_a_revisar', case when v_err is null then v_revisar end,
      'saldo_motivo', case when v_err is null then v_motivo end,
      'externo_id', v_ext);
    v_res := v_res || v_row;
  end loop;

  if p_confirmar and v_errs > 0 then
    raise exception 'IMPORTACION_CON_ERRORES' using errcode = 'P0001',
      detail = jsonb_build_object('errores', (select jsonb_agg(x) from jsonb_array_elements(v_res) x where x ->> 'estado' = 'error'))::text;
  end if;

  return jsonb_build_object(
    'confirmado', p_confirmar, 'total_filas', jsonb_array_length(p_filas),
    'nuevas', v_nuevas, 'duplicadas', v_dups, 'errores', v_errs,
    'a_revisar', (select count(*) from jsonb_array_elements(v_res) x where (x ->> 'saldo_a_revisar')::boolean),
    'clientes_nuevos', coalesce((select jsonb_agg(value) from jsonb_each(v_clis)), '[]'::jsonb),
    'filas', v_res);
end $$;

-- ── Grants ────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_cobro_json(bigint)',
    '_ventas_cobro_recalcular(bigint)',
    '_ventas_aplicar(text, bigint, jsonb, date, uuid)',
    'ventas_registrar_cobro(jsonb, jsonb, jsonb, jsonb, uuid)',
    'ventas_imputar(jsonb, jsonb, uuid, date)',
    'ventas_anular_cobro(bigint, text, uuid)',
    'ventas_anular_imputacion(bigint, uuid, text)',
    'ventas_cambiar_vencimiento(bigint, date, uuid)',
    'ventas_externos_marcar(bigint[], text, uuid, text, date)',
    'ventas_importar_externos(jsonb, uuid, boolean, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
