-- =====================================================================
-- Compras: «Pagar en lote» — varias órdenes de pago, una por proveedor,
-- TODO O NADA (2026-09-25)
--
-- Por qué: hoy «💸 Pagar» sólo acepta facturas de UN proveedor (una OP es de
-- un solo proveedor, §5.18). Para pagar el viernes a diez proveedores había
-- que abrir el modal diez veces. El lote arma N OP en una sola transacción:
-- si UNA falla (separación de funciones, saldo, cheques, datos de pago…) no
-- se crea NINGUNA.
--
-- pagos_emitir_ordenes_lote(p_ordenes jsonb, p_user_id uuid):
--   p_ordenes = [ { orden: <p_orden de pagos_registrar_orden, con proveedor_id>,
--                   lineas: <p_lineas>, adjuntos: <p_adjuntos> }, … ]  (1..30)
--   - Cada elemento pasa por _pagos_emitir_orden(…, p_exigir_aprobada = true):
--     las mismas reglas que la OP suelta (aprobada, del proveedor, saldo
--     pagable, NO_PUEDE_PAGAR_PROPIA / NO_PUEDE_PAGAR_LO_QUE_APROBO salvo
--     admin, Σ cheques = monto, fecha de cobro, comprobante, cuenta origen,
--     cuenta destino del padrón). NO se redefine _pagos_emitir_orden.
--   - Un proveedor aparece una sola vez (PROVEEDOR_REPETIDO_EN_LOTE) y una
--     factura en una sola OP (FACTURA_REPETIDA_EN_LOTE).
--   - Las facturas de TODO el lote se bloquean al principio en orden de id
--     (mismo orden que el resto de las RPC de Pagos): dos lotes cruzados no
--     se trancan entre sí.
--   - Si falla la OP i, el error sale con el MISMO código de siempre y el
--     detalle original + { indice (0-based), proveedor_id }. El raise aborta
--     la transacción entera: las OP anteriores del lote se deshacen.
--   - Permiso: admin o pagos.registrar_pagos (lo repite el backend).
--   Devuelve { ordenes: [ { indice, proveedor_id, orden (v_pagos_ordenes),
--              facturas (v_pagos_facturas de sus líneas) } ] }.
-- =====================================================================

create or replace function public.pagos_emitir_ordenes_lote(p_ordenes jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin   boolean;
  v_n       int;
  v_ids     bigint[];
  e         record;
  v_prov    bigint;
  v_oid     bigint;
  v_out     jsonb := '[]'::jsonb;
  v_msg     text;
  v_detail  text;
  v_state   text;
  v_det     jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_admin := coalesce(public._pagos_es_admin(p_user_id), false);
  if not (v_admin or public._pagos_flag(p_user_id, 'registrar_pagos', false)) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'registrar_pagos')::text;
  end if;

  if p_ordenes is null or jsonb_typeof(p_ordenes) <> 'array' or jsonb_array_length(p_ordenes) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_ordenes);
  if v_n > 30 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 30, 'cantidad', v_n)::text;
  end if;

  -- Un proveedor, una OP.
  select (x.v -> 'orden' ->> 'proveedor_id')::bigint into v_prov
    from jsonb_array_elements(p_ordenes) as x(v)
   group by (x.v -> 'orden' ->> 'proveedor_id')::bigint having count(*) > 1 limit 1;
  if found then
    raise exception 'PROVEEDOR_REPETIDO_EN_LOTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_prov)::text;
  end if;

  -- Una factura, una OP (dentro de la misma OP ya lo frena LINEA_DUPLICADA).
  select (l.v ->> 'factura_id')::bigint into v_prov
    from jsonb_array_elements(p_ordenes) with ordinality as x(v, n)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(x.v -> 'lineas') = 'array' then x.v -> 'lineas' else '[]'::jsonb end) as l(v)
   where l.v ->> 'factura_id' is not null
   group by (l.v ->> 'factura_id')::bigint having count(distinct x.n) > 1 limit 1;
  if found then
    raise exception 'FACTURA_REPETIDA_EN_LOTE' using errcode = 'P0001', detail = json_build_object('factura_id', v_prov)::text;
  end if;

  -- Locks de todas las facturas del lote, en orden de id.
  select array_agg(distinct (l.v ->> 'factura_id')::bigint) into v_ids
    from jsonb_array_elements(p_ordenes) as x(v)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(x.v -> 'lineas') = 'array' then x.v -> 'lineas' else '[]'::jsonb end) as l(v)
   where l.v ->> 'factura_id' is not null;
  if v_ids is not null then
    perform 1 from public.pagos_facturas where id = any (v_ids) order by id for update;
  end if;

  for e in select x.v, (x.n - 1)::int as indice from jsonb_array_elements(p_ordenes) with ordinality as x(v, n) order by x.n loop
    v_prov := nullif(e.v -> 'orden' ->> 'proveedor_id', '')::bigint;
    if v_prov is null then
      raise exception 'PROVEEDOR_REQUERIDO' using errcode = 'P0001', detail = json_build_object('indice', e.indice)::text;
    end if;
    begin
      v_oid := public._pagos_emitir_orden(v_prov, e.v -> 'orden', e.v -> 'lineas', e.v -> 'adjuntos', p_user_id, true);
    exception when others then
      get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail, v_state = returned_sqlstate;
      begin
        v_det := case when coalesce(v_detail, '') = '' then '{}'::jsonb else v_detail::jsonb end;
        if jsonb_typeof(v_det) <> 'object' then v_det := jsonb_build_object('mensaje', v_det); end if;
      exception when others then
        v_det := jsonb_build_object('mensaje', v_detail);
      end;
      raise exception using message = v_msg, errcode = v_state,
        detail = (v_det || jsonb_build_object('indice', e.indice, 'proveedor_id', v_prov))::text;
    end;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'indice', e.indice,
      'proveedor_id', v_prov,
      'orden', (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_oid),
      'facturas', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]'::jsonb) from public.v_pagos_facturas f
                    where f.id in (select l.factura_id from public.pagos_orden_lineas l where l.orden_id = v_oid))));
  end loop;

  return jsonb_build_object('ordenes', v_out);
end $function$;

revoke all on function public.pagos_emitir_ordenes_lote(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pagos_emitir_ordenes_lote(jsonb, uuid) to service_role;
