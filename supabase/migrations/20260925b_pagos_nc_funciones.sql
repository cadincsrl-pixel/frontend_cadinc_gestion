-- =====================================================================
-- Compras: la NC del proveedor como comprobante (2026-09-25)
-- Parte 2 de 4: saldos, estados, la puerta de las aplicaciones y la OP.
--
-- La regla del dueño: la NC baja la deuda cuando se APRUEBA. Mientras está
-- pendiente u observada, lo que declara aplicar a cada factura queda
-- RESERVADO: esa parte no se puede pagar con plata. De ahí tres números por
-- factura, todos de `_pagos_saldo_factura`:
--     saldo          = total − pagado (OP) − acreditado (NC aprobadas vigentes)
--     nc_pendiente   = Σ aplicaciones de NC sin aprobar y no anuladas
--     saldo_pagable  = saldo − nc_pendiente   ← tope de lo que paga una OP
-- Una NC nunca es deuda: su saldo es 0.
--
-- Estados (`_pagos_recalcular_estado`, dos ramas):
--   · Factura: lo aplicado es OP + NC aprobadas vigentes, pero sólo pasa a
--     pagada / pagada_parcial si está aprobada (o se pagó al cargar), por el
--     CHECK pagos_facturas_aprob_pag_chk. Una factura pendiente con una NC ya
--     aprobada baja su saldo y sigue pendiente hasta que alguien la apruebe.
--   · NC: sin aprobar → pendiente/observada; aprobada → pagada si está toda
--     aplicada («aplicada»), pagada_parcial si en parte («aplicada en parte»),
--     aprobada si nada («crédito disponible»).
--
-- `_pagos_guardar_aplicaciones` es la ÚNICA puerta a pagos_nc_aplicaciones:
-- reemplaza (NC sin aprobar) o agrega (NC aprobada, `pagos_aplicar_nc`). Los
-- triggers repiten las reglas de fondo (misma clase, mismo proveedor, nada
-- anulado, congelado al aprobar) por si alguien escribe por SQL, y recalculan
-- los estados de la factura y de la NC.
--
-- Cuando una NC se aprueba, se desaprueba o se anula, cambia lo que acredita:
-- `trg_pagos_nc_vigencia` recalcula las facturas afectadas (sin bucle: sólo
-- mira NC, y el recálculo de una factura no toca NC).
--
-- La OP (`_pagos_emitir_orden`) ya no acepta líneas `nota_credito`
-- (NC_ES_COMPROBANTE), no paga una NC (NC_NO_SE_PAGA) y su tope por factura
-- es `saldo_pagable`. La firma no cambia.
--
-- Cambio de cuenta del proveedor: sólo desaprueba FACTURAS. Una NC no mueve
-- plata hacia el proveedor, la cuenta destino no la afecta.
-- =====================================================================

-- ── 1) Saldo de una factura ────────────────────────────────────────────
create or replace function public._pagos_saldo_factura(p_factura_id bigint, p_con_reservas boolean default false)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select (case when f.clase = 'nota_credito' or f.estado = 'anulada' or f.paga_cliente then 0::numeric
          else f.total
             - coalesce((select sum(l.monto) from public.pagos_orden_lineas l
                           join public.pagos_ordenes o on o.id = l.orden_id
                          where l.factura_id = f.id and o.estado = 'emitida' and l.tipo in ('factura', 'nota_credito')), 0)
             - coalesce((select sum(a.monto) from public.pagos_nc_aplicaciones a
                           join public.pagos_facturas n on n.id = a.nc_id
                          where a.factura_id = f.id and n.estado <> 'anulada'
                            and (n.aprobada_at is not null or p_con_reservas)), 0)
          end)::numeric(14,2)
    from public.pagos_facturas f
   where f.id = p_factura_id
$function$;
revoke all on function public._pagos_saldo_factura(bigint, boolean) from public, anon, authenticated;
grant execute on function public._pagos_saldo_factura(bigint, boolean) to service_role;

-- ── 2) Estado: dos ramas ───────────────────────────────────────────────
create or replace function public._pagos_recalcular_estado(p_factura_id bigint)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f        public.pagos_facturas%rowtype;
  v_aplicado numeric(14,2);
  v_puede    boolean;
  v_nuevo    text;
begin
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then return; end if;

  if v_f.clase = 'nota_credito' then
    select coalesce(sum(a.monto), 0) into v_aplicado
      from public.pagos_nc_aplicaciones a where a.nc_id = p_factura_id;
    v_nuevo := case
      when v_f.estado = 'anulada'              then 'anulada'
      when v_f.aprobada_at is null             then case when v_f.motivo_observacion is not null then 'observada' else 'pendiente' end
      when v_aplicado >= v_f.total             then 'pagada'
      when v_aplicado > 0                      then 'pagada_parcial'
      else 'aprobada' end;
  else
    select coalesce(sum(l.monto), 0) into v_aplicado
      from public.pagos_orden_lineas l
      join public.pagos_ordenes o on o.id = l.orden_id
     where l.factura_id = p_factura_id and o.estado = 'emitida' and l.tipo in ('factura','nota_credito');
    v_aplicado := v_aplicado + coalesce((
      select sum(a.monto) from public.pagos_nc_aplicaciones a
        join public.pagos_facturas n on n.id = a.nc_id
       where a.factura_id = p_factura_id and n.aprobada_at is not null and n.estado <> 'anulada'), 0);
    -- pagos_facturas_aprob_pag_chk: pagada sólo si está aprobada o se pagó al cargar.
    v_puede := v_f.aprobada_at is not null or v_f.pagada_al_cargar;
    v_nuevo := case
      when v_f.estado = 'anulada'                 then 'anulada'
      when v_puede and v_aplicado >= v_f.total    then 'pagada'
      when v_puede and v_aplicado > 0             then 'pagada_parcial'
      when v_f.motivo_observacion is not null     then 'observada'
      when v_f.aprobada_at is not null            then 'aprobada'
      else 'pendiente' end;
  end if;

  if v_nuevo is distinct from v_f.estado then
    perform set_config('cadinc.pagos_recalc', 'on', true);
    update public.pagos_facturas set estado = v_nuevo where id = p_factura_id;
    perform set_config('cadinc.pagos_recalc', 'off', true);
  end if;
end $function$;
revoke all on function public._pagos_recalcular_estado(bigint) from public, anon, authenticated;
grant execute on function public._pagos_recalcular_estado(bigint) to service_role;

-- ── 3) Una NC no se paga ───────────────────────────────────────────────
create or replace function public._pagos_validar_pagable(p_factura_id bigint, p_proveedor_id bigint)
returns pagos_facturas
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_f public.pagos_facturas%rowtype;
begin
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.clase = 'nota_credito' then
    raise exception 'NC_NO_SE_PAGA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.proveedor_id <> p_proveedor_id then
    raise exception 'FACTURA_OTRO_PROVEEDOR' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'proveedor_id', v_f.proveedor_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado not in ('aprobada', 'pagada_parcial') then
    raise exception 'FACTURA_NO_APROBADA' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  return v_f;
end $function$;
revoke all on function public._pagos_validar_pagable(bigint, bigint) from public, anon, authenticated;
grant execute on function public._pagos_validar_pagable(bigint, bigint) to service_role;

-- ── 4) La orden de pago: sólo plata, tope saldo_pagable ────────────────
-- Igual que la viva (20260921b) salvo: línea `nota_credito` → NC_ES_COMPROBANTE;
-- una NC como línea factura → NC_NO_SE_PAGA; tope = _pagos_saldo_factura(id, true);
-- sin forma 'nota_credito' ni PDF de NC obligatorio (ya no hay OP «solo NC»).
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

  -- Líneas: sólo plata (factura o a cuenta). La NC es un comprobante aparte.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = 'P0001';
  end if;
  for l in select coalesce(x.tipo, 'factura') as tipo, x.factura_id, x.monto
             from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint, monto numeric) loop
    if l.tipo = 'nota_credito' then
      raise exception 'NC_ES_COMPROBANTE' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id)::text;
    end if;
    if l.tipo not in ('factura', 'a_cuenta') or l.monto is null or l.monto <= 0
       or (l.tipo = 'a_cuenta') <> (l.factura_id is null) then
      raise exception 'LINEA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('tipo', l.tipo, 'factura_id', l.factura_id, 'monto', l.monto)::text;
    end if;
    v_pagado := v_pagado + l.monto;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint)
              where x.factura_id is not null group by x.factura_id, coalesce(x.tipo, 'factura') having count(*) > 1) then
    raise exception 'LINEA_DUPLICADA' using errcode = 'P0001';
  end if;

  -- Facturas: en orden de id (mismo orden en todas las RPC), aprobadas, del proveedor, con saldo pagable.
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
      if found and v_f.clase = 'nota_credito' then
        raise exception 'NC_NO_SE_PAGA' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
      end if;
      if not found or v_f.proveedor_id <> p_proveedor_id or v_f.estado = 'anulada' or v_f.paga_cliente then
        raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
          detail = json_build_object('factura_id', g.factura_id, 'estado', v_f.estado)::text;
      end if;
    end if;
    -- Tope: lo que queda sin pagar, sin acreditar y sin reservar por una NC pendiente.
    v_saldo := public._pagos_saldo_factura(g.factura_id, true);
    if g.monto > v_saldo + 0.001 then
      raise exception 'MONTO_SUPERA_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'saldo', v_saldo, 'saldo_pagable', v_saldo, 'monto', g.monto)::text;
    end if;
  end loop;

  if p_orden ? 'monto_pagado' and abs(coalesce((p_orden ->> 'monto_pagado')::numeric, 0) - v_pagado) > 0.01 then
    raise exception 'SUMA_LINEAS_DISTINTA' using errcode = 'P0001',
      detail = json_build_object('monto_pagado', (p_orden ->> 'monto_pagado')::numeric, 'suma', v_pagado)::text;
  end if;

  if v_forma is null or v_forma not in ('efectivo','transferencia','cheque','echeq','tarjeta','debito_automatico','otro') then
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
    select min(x.fecha_cobro) into v_fecha_cobro
      from jsonb_to_recordset(v_cheques) as x(fecha_cobro date);
  elsif jsonb_array_length(v_cheques) > 0 then
    raise exception 'CHEQUES_INESPERADOS' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
  end if;

  if v_fecha_cobro is not null and v_fecha_cobro < v_fecha then
    raise exception 'FECHA_COBRO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('fecha', v_fecha, 'fecha_cobro', v_fecha_cobro)::text;
  end if;
  if v_forma in ('transferencia', 'debito_automatico') then
    if v_prov.cbu is null and v_prov.alias_cbu is null then
      raise exception 'PROVEEDOR_SIN_DATOS_PAGO' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
    end if;
    v_cbu := v_prov.cbu; v_alias := v_prov.alias_cbu;
  end if;

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
  if v_forma in ('transferencia', 'echeq')
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')::text;
  end if;

  perform pg_advisory_xact_lock(hashtext('pagos_ordenes_numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pagos_ordenes;

  insert into public.pagos_ordenes (numero, proveedor_id, fecha, fecha_cobro, forma_pago, referencia, cbu_destino, alias_destino,
                                    monto_pagado, monto_nc, obs, created_by, updated_by)
  values (v_numero, p_proveedor_id, v_fecha, v_fecha_cobro, v_forma, coalesce(p_orden ->> 'referencia', ''), v_cbu, v_alias,
          v_pagado, 0, coalesce(p_orden ->> 'obs', ''), p_user_id, p_user_id)
  returning id into v_id;

  insert into public.pagos_orden_lineas (orden_id, tipo, factura_id, monto)
  select v_id, coalesce(x.tipo, 'factura'), x.factura_id, round(x.monto, 2)
    from jsonb_array_elements(p_lineas) with ordinality as e(v, n)
    cross join lateral jsonb_to_record(e.v) as x(tipo text, factura_id bigint, monto numeric)
   order by e.n;

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
grant execute on function public._pagos_emitir_orden(bigint, jsonb, jsonb, jsonb, uuid, boolean) to service_role;

-- ── 5) La puerta de las aplicaciones ───────────────────────────────────
-- p_aplica_a = [{ factura_id, monto }] (repetidas se suman).
-- p_agregar = false → REEMPLAZA (sólo NC sin aprobar: alta y edición).
-- p_agregar = true  → AGREGA sobre lo que ya hay (NC aprobada: pagos_aplicar_nc).
create or replace function public._pagos_guardar_aplicaciones(p_nc_id bigint, p_aplica_a jsonb, p_user_id uuid, p_agregar boolean default false)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_arr   jsonb;
  v_nc    public.pagos_facturas%rowtype;
  v_f     public.pagos_facturas%rowtype;
  v_disp  numeric(14,2);
  v_apl   numeric(14,2);
  g       record;
begin
  if p_aplica_a is null or jsonb_typeof(p_aplica_a) = 'null' then
    v_arr := '[]'::jsonb;
  elsif jsonb_typeof(p_aplica_a) <> 'array' then
    raise exception 'NC_APLICACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
  else
    v_arr := p_aplica_a;
  end if;
  if jsonb_array_length(v_arr) > 50 or exists (
       select 1 from jsonb_array_elements(v_arr) e
        where jsonb_typeof(e) <> 'object' or (e ->> 'factura_id') is null or (e ->> 'monto') is null
           or (e ->> 'monto')::numeric <= 0) then
    raise exception 'NC_APLICACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'aplica_a')::text;
  end if;

  -- Locks: la NC y todas las facturas que toca (las nuevas y las de antes), en orden de id.
  perform 1 from public.pagos_facturas
   where id = p_nc_id
      or id in (select (e ->> 'factura_id')::bigint from jsonb_array_elements(v_arr) e)
      or id in (select a.factura_id from public.pagos_nc_aplicaciones a where a.nc_id = p_nc_id)
   order by id for update;

  select * into v_nc from public.pagos_facturas where id = p_nc_id;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  if v_nc.clase <> 'nota_credito' then
    if jsonb_array_length(v_arr) > 0 then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id, 'campo', 'aplica_a')::text;
    end if;
    return;
  end if;
  if v_nc.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_nc_id)::text;
  end if;
  if not p_agregar then
    if v_nc.aprobada_at is not null then
      raise exception 'NC_APLICACION_CONGELADA' using errcode = 'P0001',
        detail = json_build_object('nc_id', p_nc_id, 'estado', v_nc.estado)::text;
    end if;
    delete from public.pagos_nc_aplicaciones where nc_id = p_nc_id;
  end if;

  for g in select (e ->> 'factura_id')::bigint as factura_id, round(sum((e ->> 'monto')::numeric), 2) as monto
             from jsonb_array_elements(v_arr) e group by 1 order by 1 loop
    select * into v_f from public.pagos_facturas where id = g.factura_id;
    if not found then
      raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
    end if;
    if v_f.proveedor_id <> v_nc.proveedor_id then
      raise exception 'NC_OTRO_PROVEEDOR' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'proveedor_id', v_f.proveedor_id, 'nc_proveedor_id', v_nc.proveedor_id)::text;
    end if;
    if v_f.clase <> 'factura' or v_f.estado = 'anulada' or v_f.paga_cliente then
      raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'estado', v_f.estado, 'clase', v_f.clase, 'paga_cliente', v_f.paga_cliente)::text;
    end if;
    -- Con la propia NC fuera (reemplazo: ya se borró; agregar: lo de antes ya cuenta).
    v_disp := public._pagos_saldo_factura(g.factura_id, true);
    if g.monto > v_disp + 0.001 then
      raise exception 'NC_SUPERA_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'saldo_pagable', v_disp, 'monto', g.monto)::text;
    end if;
    perform set_config('cadinc.pagos_nc_aplicar', case when p_agregar then 'on' else 'off' end, true);
    insert into public.pagos_nc_aplicaciones (nc_id, factura_id, monto, created_by, updated_by)
    values (p_nc_id, g.factura_id, g.monto, p_user_id, p_user_id)
    on conflict (nc_id, factura_id) do update
      set monto = public.pagos_nc_aplicaciones.monto + excluded.monto, updated_by = excluded.updated_by;
    perform set_config('cadinc.pagos_nc_aplicar', 'off', true);
  end loop;

  select coalesce(sum(monto), 0) into v_apl from public.pagos_nc_aplicaciones where nc_id = p_nc_id;
  if v_apl > v_nc.total + 0.001 then
    raise exception 'NC_SUPERA_TOTAL' using errcode = 'P0001',
      detail = json_build_object('nc_id', p_nc_id, 'total', v_nc.total, 'aplicado', v_apl)::text;
  end if;
end $function$;
revoke all on function public._pagos_guardar_aplicaciones(bigint, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public._pagos_guardar_aplicaciones(bigint, jsonb, uuid, boolean) to service_role;

-- ── 6) Triggers de pagos_nc_aplicaciones ───────────────────────────────
create or replace function public.fn_pagos_nc_aplicacion_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nc public.pagos_facturas%rowtype;
  v_f  public.pagos_facturas%rowtype;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return coalesce(new, old); end if;

  -- Aprobada, la NC ya bajó la deuda: lo aplicado no se cambia ni se borra.
  -- Sólo se agrega (pagos_aplicar_nc), que en una fila existente es subir el monto.
  if tg_op in ('UPDATE', 'DELETE') then
    select * into v_nc from public.pagos_facturas where id = old.nc_id;
    if v_nc.aprobada_at is not null
       and not (tg_op = 'UPDATE' and coalesce(current_setting('cadinc.pagos_nc_aplicar', true), '') = 'on'
                and new.nc_id = old.nc_id and new.factura_id = old.factura_id and new.monto >= old.monto) then
      raise exception 'NC_APLICACION_CONGELADA' using errcode = 'P0001',
        detail = json_build_object('nc_id', old.nc_id, 'factura_id', old.factura_id)::text;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select * into v_nc from public.pagos_facturas where id = new.nc_id;
    select * into v_f  from public.pagos_facturas where id = new.factura_id;
    if v_nc.clase <> 'nota_credito' then
      raise exception 'NC_TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('factura_id', new.nc_id, 'campo', 'nc_id')::text;
    end if;
    if v_f.proveedor_id <> v_nc.proveedor_id then
      raise exception 'NC_OTRO_PROVEEDOR' using errcode = 'P0001',
        detail = json_build_object('factura_id', new.factura_id, 'proveedor_id', v_f.proveedor_id, 'nc_proveedor_id', v_nc.proveedor_id)::text;
    end if;
    if v_nc.estado = 'anulada' then
      raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', new.nc_id)::text;
    end if;
    if v_f.clase <> 'factura' or v_f.estado = 'anulada' or v_f.paga_cliente then
      raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
        detail = json_build_object('factura_id', new.factura_id, 'estado', v_f.estado, 'clase', v_f.clase, 'paga_cliente', v_f.paga_cliente)::text;
    end if;
  end if;
  return coalesce(new, old);
end $function$;
revoke all on function public.fn_pagos_nc_aplicacion_guard() from public, anon, authenticated;

create or replace function public.fn_pagos_nc_aplicacion_recalc()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public._pagos_recalcular_estado(new.factura_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.factura_id is distinct from new.factura_id) then
    perform public._pagos_recalcular_estado(old.factura_id);
  end if;
  perform public._pagos_recalcular_estado(coalesce(new.nc_id, old.nc_id));
  if tg_op = 'UPDATE' and old.nc_id is distinct from new.nc_id then
    perform public._pagos_recalcular_estado(old.nc_id);
  end if;
  return null;
end $function$;
revoke all on function public.fn_pagos_nc_aplicacion_recalc() from public, anon, authenticated;

drop trigger if exists trg_pagos_nc_aplicacion_guard on public.pagos_nc_aplicaciones;
create trigger trg_pagos_nc_aplicacion_guard before insert or update or delete on public.pagos_nc_aplicaciones
  for each row execute function public.fn_pagos_nc_aplicacion_guard();
drop trigger if exists trg_pagos_nc_aplicacion_recalc on public.pagos_nc_aplicaciones;
create trigger trg_pagos_nc_aplicacion_recalc after insert or update or delete on public.pagos_nc_aplicaciones
  for each row execute function public.fn_pagos_nc_aplicacion_recalc();

-- ── 7) Vigencia de la NC: aprobar / desaprobar / anular mueve la deuda ──
create or replace function public.fn_pagos_nc_vigencia()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_fid bigint;
begin
  for v_fid in select a.factura_id from public.pagos_nc_aplicaciones a where a.nc_id = new.id order by a.factura_id loop
    perform public._pagos_recalcular_estado(v_fid);
  end loop;
  return null;
end $function$;
revoke all on function public.fn_pagos_nc_vigencia() from public, anon, authenticated;

drop trigger if exists trg_pagos_nc_vigencia on public.pagos_facturas;
create trigger trg_pagos_nc_vigencia after update of estado, aprobada_at on public.pagos_facturas
  for each row
  when (new.clase = 'nota_credito'
        and (old.aprobada_at is distinct from new.aprobada_at
             or (old.estado = 'anulada') is distinct from (new.estado = 'anulada')))
  execute function public.fn_pagos_nc_vigencia();

-- ── 8) Cambio de cuenta del proveedor: sólo desaprueba facturas ────────
create or replace function public.fn_pagos_proveedor_cuenta_cambiada()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.cbu is distinct from old.cbu or new.alias_cbu is distinct from old.alias_cbu then
    new.datos_pago_actualizados_at  := now();
    new.datos_pago_actualizados_por := coalesce(new.updated_by, public.usuario_actual());
    if coalesce(current_setting('cadinc.descongelar', true), '') <> 'on' then
      update public.pagos_facturas
         set estado = 'pendiente', aprobada_por = null, aprobada_at = null,
             obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — aprobación retirada: cambió la cuenta del proveedor')
       where proveedor_id = new.id and estado = 'aprobada' and clase = 'factura';
    end if;
  end if;
  return new;
end $function$;
