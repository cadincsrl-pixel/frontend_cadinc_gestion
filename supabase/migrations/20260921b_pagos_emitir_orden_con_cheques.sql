-- `_pagos_emitir_orden`: los cheques entran por `p_orden -> 'cheques'`.
--
-- No cambia la firma a propósito: `p_orden` ya es una bolsa jsonb, así que los
-- dos llamadores (`pagos_registrar_orden` y `pagos_crear_factura`, la factura
-- que se carga ya pagada) quedan intactos y la regla vale para los dos. Un
-- cheque es un cheque venga de donde venga: si el admin marca una factura como
-- pagada con cheque, también tiene que decir cuál.
--
-- `fecha_cobro` de la orden pasa a ser DERIVADA = la primera fecha de sus
-- cheques. Lo que venga en `p_orden.fecha_cobro` para esas formas se ignora.

create or replace function public._pagos_emitir_orden(p_proveedor_id bigint, p_orden jsonb, p_lineas jsonb, p_adjuntos jsonb, p_user_id uuid, p_exigir_aprobada boolean)
 returns bigint
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prov        public.pagos_proveedores%rowtype;
  v_f           public.pagos_facturas%rowtype;
  v_es_admin    boolean;
  v_fecha       date;
  v_fecha_cobro date;
  v_forma       text;
  v_pagado      numeric(14,2) := 0;
  v_nc          numeric(14,2) := 0;
  v_cbu         text;
  v_alias       text;
  v_adjuntos    jsonb;
  v_cheques     jsonb;
  v_suma_cheq   numeric(14,2) := 0;
  v_numero      int;
  v_id          bigint;
  v_saldo       numeric(14,2);
  v_constraint  text;
  l             record;
  a             record;
  c             record;
  g             record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_es_admin := public._pagos_es_admin(p_user_id);
  select * into v_prov from public.pagos_proveedores where id = p_proveedor_id;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
  end if;

  v_fecha := (p_orden ->> 'fecha')::date;
  if v_fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  v_fecha_cobro := (p_orden ->> 'fecha_cobro')::date;
  v_forma := nullif(btrim(p_orden ->> 'forma_pago'), '');

  -- Líneas
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = 'P0001';
  end if;
  for l in select coalesce(x.tipo, 'factura') as tipo, x.factura_id, x.monto, nullif(btrim(x.nc_numero), '') as nc_numero, x.nc_fecha
             from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint, monto numeric, nc_numero text, nc_fecha date) loop
    if l.tipo not in ('factura', 'a_cuenta', 'nota_credito') or l.monto is null or l.monto <= 0
       or (l.tipo = 'a_cuenta') <> (l.factura_id is null) then
      raise exception 'LINEA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('tipo', l.tipo, 'factura_id', l.factura_id, 'monto', l.monto)::text;
    end if;
    if l.tipo = 'nota_credito' and (l.nc_numero is null or l.nc_fecha is null) then
      raise exception 'NC_DATOS_REQUERIDOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id)::text;
    end if;
    if l.tipo = 'nota_credito' then v_nc := v_nc + l.monto; else v_pagado := v_pagado + l.monto; end if;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint)
              where x.factura_id is not null group by x.factura_id, coalesce(x.tipo, 'factura') having count(*) > 1) then
    raise exception 'LINEA_DUPLICADA' using errcode = 'P0001';
  end if;

  -- Facturas: en orden de id (mismo orden en todas las RPC), aprobadas, del proveedor, con saldo.
  for g in select x.factura_id, sum(x.monto) as monto
             from jsonb_to_recordset(p_lineas) as x(factura_id bigint, monto numeric)
            where x.factura_id is not null group by x.factura_id order by x.factura_id loop
    if p_exigir_aprobada then
      select * into v_f from public._pagos_validar_pagable(g.factura_id, p_proveedor_id);
      if not v_es_admin and v_f.created_by = p_user_id then
        raise exception 'NO_PUEDE_PAGAR_PROPIA' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
      end if;
      if not v_es_admin and v_f.aprobada_por = p_user_id then
        raise exception 'NO_PUEDE_PAGAR_LO_QUE_APROBO' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
      end if;
    else
      select * into v_f from public.pagos_facturas where id = g.factura_id for update;
      if not found or v_f.proveedor_id <> p_proveedor_id or v_f.estado = 'anulada' or v_f.paga_cliente then
        raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
          detail = json_build_object('factura_id', g.factura_id, 'estado', v_f.estado)::text;
      end if;
    end if;
    select v_f.total - coalesce(sum(x.monto), 0) into v_saldo
      from public.pagos_orden_lineas x join public.pagos_ordenes o on o.id = x.orden_id
     where x.factura_id = g.factura_id and o.estado = 'emitida' and x.tipo in ('factura', 'nota_credito');
    if g.monto > v_saldo + 0.001 then
      raise exception 'MONTO_SUPERA_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'saldo', v_saldo, 'monto', g.monto)::text;
    end if;
  end loop;

  if p_orden ? 'monto_pagado' and abs(coalesce((p_orden ->> 'monto_pagado')::numeric, 0) - v_pagado) > 0.01 then
    raise exception 'SUMA_LINEAS_DISTINTA' using errcode = 'P0001',
      detail = json_build_object('monto_pagado', (p_orden ->> 'monto_pagado')::numeric, 'suma', v_pagado)::text;
  end if;

  -- Forma: sin plata → nota_credito (y solo entonces).
  if v_pagado = 0 then
    if v_forma is null or v_forma = 'nota_credito' then v_forma := 'nota_credito';
    else raise exception 'FORMA_PAGO_INVALIDA' using errcode = 'P0001',
           detail = json_build_object('forma_pago', v_forma, 'monto_pagado', v_pagado)::text;
    end if;
  elsif v_forma is null or v_forma not in ('efectivo','transferencia','cheque','echeq','tarjeta','debito_automatico','otro') then
    raise exception 'FORMA_PAGO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'monto_pagado', v_pagado)::text;
  end if;

  -- ── Cheques: uno por fila ──
  v_cheques := case when p_orden -> 'cheques' is null or jsonb_typeof(p_orden -> 'cheques') <> 'array'
                    then '[]'::jsonb else p_orden -> 'cheques' end;
  if v_forma in ('cheque', 'echeq') then
    if jsonb_array_length(v_cheques) = 0 then
      raise exception 'CHEQUES_REQUERIDOS' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
    end if;
    for c in select nullif(btrim(x.numero), '') as numero, coalesce(btrim(x.banco), '') as banco,
                    x.fecha_cobro, x.monto, coalesce(x.es_propio, true) as es_propio,
                    coalesce(btrim(x.librador), '') as librador
               from jsonb_to_recordset(v_cheques) as x(numero text, banco text, fecha_cobro date, monto numeric, es_propio boolean, librador text) loop
      if c.numero is null or c.fecha_cobro is null or c.monto is null or c.monto <= 0 then
        raise exception 'CHEQUE_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('numero', c.numero, 'fecha_cobro', c.fecha_cobro, 'monto', c.monto)::text;
      end if;
      -- Endosado de un tercero: si rebota, el problema es de ese tercero. Sin
      -- librador el cheque no se puede reclamar a nadie.
      if not c.es_propio and c.librador = '' then
        raise exception 'CHEQUE_SIN_LIBRADOR' using errcode = 'P0001', detail = json_build_object('numero', c.numero)::text;
      end if;
      if c.fecha_cobro < v_fecha then
        raise exception 'FECHA_COBRO_INVALIDA' using errcode = 'P0001',
          detail = json_build_object('fecha', v_fecha, 'fecha_cobro', c.fecha_cobro, 'numero', c.numero)::text;
      end if;
      v_suma_cheq := v_suma_cheq + c.monto;
    end loop;
    if abs(v_suma_cheq - v_pagado) > 0.01 then
      raise exception 'SUMA_CHEQUES_DISTINTA' using errcode = 'P0001',
        detail = json_build_object('suma_cheques', v_suma_cheq, 'monto_pagado', v_pagado)::text;
    end if;
    -- Derivada: la primera que cae.
    select min(x.fecha_cobro) into v_fecha_cobro
      from jsonb_to_recordset(v_cheques) as x(fecha_cobro date);
  elsif jsonb_array_length(v_cheques) > 0 then
    raise exception 'CHEQUES_INESPERADOS' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
  end if;

  if v_fecha_cobro is not null and v_fecha_cobro < v_fecha then
    raise exception 'FECHA_COBRO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('fecha', v_fecha, 'fecha_cobro', v_fecha_cobro)::text;
  end if;
  -- Cuenta destino: FOTO del padrón, el contador no la tipea.
  if v_forma in ('transferencia', 'debito_automatico') then
    if v_prov.cbu is null and v_prov.alias_cbu is null then
      raise exception 'PROVEEDOR_SIN_DATOS_PAGO' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
    end if;
    v_cbu := v_prov.cbu; v_alias := v_prov.alias_cbu;
  end if;

  -- Adjuntos: objeto o array; comprobante por forma solo si sale plata; NC exige su PDF.
  v_adjuntos := case when p_adjuntos is null or jsonb_typeof(p_adjuntos) = 'null' then '[]'::jsonb
                     when jsonb_typeof(p_adjuntos) = 'object' then jsonb_build_array(p_adjuntos)
                     else p_adjuntos end;
  for a in select * from jsonb_to_recordset(v_adjuntos) as x(tipo text, storage_path text, nombre_archivo text, hash_sha256 text, mime_type text, size_bytes bigint, obs text) loop
    if coalesce(a.tipo, '') not in ('comprobante_pago', 'nota_credito', 'otro') or coalesce(a.storage_path, '') = ''
       or coalesce(a.nombre_archivo, '') = '' or coalesce(a.hash_sha256, '') = '' or coalesce(a.mime_type, '') = ''
       or a.size_bytes is null or a.size_bytes <= 0 then
      raise exception 'ADJUNTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('tipo', a.tipo, 'storage_path', a.storage_path)::text;
    end if;
  end loop;
  if v_pagado > 0 and v_forma in ('transferencia', 'echeq')
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')::text;
  end if;
  if v_nc > 0 and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'nota_credito') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', 'nota_credito', 'tipo', 'nota_credito')::text;
  end if;

  -- Número al final, sin huecos por intentos fallidos.
  perform pg_advisory_xact_lock(hashtext('pagos_ordenes_numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pagos_ordenes;

  insert into public.pagos_ordenes (numero, proveedor_id, fecha, fecha_cobro, forma_pago, referencia, cbu_destino, alias_destino,
                                    monto_pagado, monto_nc, obs, created_by, updated_by)
  values (v_numero, p_proveedor_id, v_fecha, v_fecha_cobro, v_forma, coalesce(p_orden ->> 'referencia', ''), v_cbu, v_alias,
          v_pagado, v_nc, coalesce(p_orden ->> 'obs', ''), p_user_id, p_user_id)
  returning id into v_id;

  insert into public.pagos_orden_lineas (orden_id, tipo, factura_id, monto, nc_numero, nc_fecha)
  select v_id, coalesce(x.tipo, 'factura'), x.factura_id, round(x.monto, 2),
         case when coalesce(x.tipo, 'factura') = 'nota_credito' then nullif(btrim(x.nc_numero), '') end,
         case when coalesce(x.tipo, 'factura') = 'nota_credito' then x.nc_fecha end
    from jsonb_array_elements(p_lineas) with ordinality as e(v, n)
    cross join lateral jsonb_to_record(e.v) as x(tipo text, factura_id bigint, monto numeric, nc_numero text, nc_fecha date)
   order by e.n;

  -- El trigger `trg_pagos_cheque_unico` frena acá el cheque repetido.
  insert into public.pagos_cheques (orden_id, numero, banco, fecha_cobro, monto, es_propio, librador, obs)
  select v_id, btrim(x.numero), coalesce(btrim(x.banco), ''), x.fecha_cobro, round(x.monto, 2),
         coalesce(x.es_propio, true), coalesce(btrim(x.librador), ''), coalesce(x.obs, '')
    from jsonb_array_elements(v_cheques) with ordinality as e(v, n)
    cross join lateral jsonb_to_record(e.v) as x(numero text, banco text, fecha_cobro date, monto numeric, es_propio boolean, librador text, obs text)
   order by e.n;

  begin
    insert into public.pagos_ordenes_adjuntos (orden_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, obs, created_by, updated_by)
    select v_id, x.tipo, x.storage_path, x.nombre_archivo, x.hash_sha256, x.mime_type, x.size_bytes, coalesce(x.obs, ''), p_user_id, p_user_id
      from jsonb_to_recordset(v_adjuntos) as x(tipo text, storage_path text, nombre_archivo text, hash_sha256 text, mime_type text, size_bytes bigint, obs text);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception 'ADJ_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('entidad', 'orden', 'orden_id', v_id, 'constraint', v_constraint)::text;
  end;
  return v_id;
end $function$;

revoke all on function public._pagos_emitir_orden(bigint, jsonb, jsonb, jsonb, uuid, boolean) from public, anon, authenticated;
