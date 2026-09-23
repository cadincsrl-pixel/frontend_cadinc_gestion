-- =====================================================================
-- Devolución del proveedor: anular la OP y rehacerla con la NC, de una vez
-- (2026-09-23)
--
-- Pedido del dueño: «¿cómo hago si un pago pagado lo cancelo, me devuelven el
-- dinero y hacemos OP?» — con nota de crédito del proveedor. Se podía hacer a
-- mano en tres pasos (anular la OP, pagar la factura con una OP «solo NC»,
-- subir el comprobante); «hacelo»: un botón que hace todo junto.
--
-- Qué hace, en UNA transacción:
--   1. Anula la OP original (pagos_anular_orden), con un motivo que dice qué
--      se devolvió y con qué NC. Las facturas vuelven a su estado anterior y
--      los cheques de esa OP quedan libres.
--   2. Emite una OP nueva, con la fecha de la original, que por cada factura
--      lleva la NC por lo devuelto y — si la devolución fue PARCIAL — la plata
--      que en realidad quedó pagada. Así la cuenta cierra: salieron 100,
--      volvieron 30, la OP nueva dice 70 de plata + 30 de NC.
--   3. Si es parcial, la OP nueva lleva el MISMO comprobante de pago que la
--      original (misma fila del bucket): es la transferencia que sí salió.
--
-- Límites a propósito:
--   · Sólo OP de líneas `factura`. Una con «a cuenta» o con NC propias se
--     arma a mano: el reparto no es obvio y adivinarlo sería peor.
--   · Parcial con cheques NO: los cheques ya se entregaron y partirlos es
--     inventar. Con cheques sólo la devolución TOTAL (e-cheq devuelto).
--   · La OP nueva se emite con p_exigir_aprobada = false: no es un pago nuevo,
--     es el mismo pago corregido, y una factura «pagada al cargar» nunca pasó
--     por aprobación. El permiso lo controla el backend (anular_pagos o admin).
-- =====================================================================

create or replace function public.pagos_devolucion_proveedor(
  p_orden_id   bigint,
  p_devuelto   jsonb,     -- [{ factura_id, monto }]: lo que el proveedor devuelve por factura
  p_nc         jsonb,     -- { numero, fecha }
  p_motivo     text,
  p_adjuntos   jsonb,     -- PDF de la NC (obligatorio) + comprobante de la devolución (opcional, tipo 'otro')
  p_user_id    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o          public.pagos_ordenes%rowtype;
  v_nc_numero  text := nullif(btrim(p_nc ->> 'numero'), '');
  v_nc_fecha   date := (p_nc ->> 'fecha')::date;
  v_lineas     jsonb := '[]'::jsonb;
  v_adjuntos   jsonb;
  v_restante   numeric(14,2) := 0;
  v_devuelto   numeric(14,2) := 0;
  v_parcial    boolean := false;
  v_id         bigint;
  v_motivo     text;
  l            record;
  d            numeric(14,2);
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if v_nc_numero is null or v_nc_fecha is null then
    raise exception 'NC_DATOS_REQUERIDOS' using errcode = 'P0001', detail = json_build_object('campo', 'nc')::text;
  end if;
  if v_nc_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('campo', 'nc_fecha', 'hoy', public.hoy_ar())::text;
  end if;

  select * into v_o from public.pagos_ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'ORDEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;
  if v_o.estado <> 'emitida' then
    raise exception 'ORDEN_YA_ANULADA' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;
  if exists (select 1 from public.pagos_orden_lineas where orden_id = p_orden_id and tipo <> 'factura') then
    raise exception 'DEVOLUCION_SOLO_FACTURAS' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;
  -- Lo devuelto tiene que ser de facturas de esta OP.
  if exists (select 1 from jsonb_to_recordset(coalesce(p_devuelto, '[]'::jsonb)) as x(factura_id bigint, monto numeric)
              where x.factura_id not in (select factura_id from public.pagos_orden_lineas where orden_id = p_orden_id)) then
    raise exception 'DEVOLUCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('motivo', 'factura_ajena')::text;
  end if;

  for l in select li.factura_id, li.monto from public.pagos_orden_lineas li where li.orden_id = p_orden_id order by li.id loop
    select coalesce(sum(x.monto), 0) into d
      from jsonb_to_recordset(coalesce(p_devuelto, '[]'::jsonb)) as x(factura_id bigint, monto numeric)
     where x.factura_id = l.factura_id;
    d := round(d, 2);
    if d < 0 or d > l.monto + 0.001 then
      raise exception 'DEVOLUCION_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id, 'devuelto', d, 'pagado', l.monto)::text;
    end if;
    if l.monto - d > 0.001 then
      v_lineas := v_lineas || jsonb_build_object('tipo', 'factura', 'factura_id', l.factura_id, 'monto', round(l.monto - d, 2));
      v_restante := v_restante + (l.monto - d);
    end if;
    if d > 0 then
      v_lineas := v_lineas || jsonb_build_object('tipo', 'nota_credito', 'factura_id', l.factura_id, 'monto', d,
                                                 'nc_numero', v_nc_numero, 'nc_fecha', v_nc_fecha);
      v_devuelto := v_devuelto + d;
    end if;
  end loop;

  if v_devuelto <= 0 then
    raise exception 'DEVOLUCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('motivo', 'nada_devuelto')::text;
  end if;
  v_parcial := v_restante > 0.001;
  if v_parcial and v_o.forma_pago in ('cheque', 'echeq') then
    raise exception 'DEVOLUCION_PARCIAL_CON_CHEQUES' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;

  -- El comprobante de lo que SÍ salió: en una parcial, el de la OP original.
  -- Se lee ANTES de anular (la anulación marca los adjuntos como borrados).
  v_adjuntos := case when p_adjuntos is null or jsonb_typeof(p_adjuntos) <> 'array' then '[]'::jsonb else p_adjuntos end;
  if v_parcial then
    v_adjuntos := v_adjuntos || coalesce((
      select jsonb_agg(jsonb_build_object('tipo', a.tipo, 'storage_path', a.storage_path, 'nombre_archivo', a.nombre_archivo,
                                          'hash_sha256', a.hash_sha256, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes,
                                          'obs', 'Del pago original, ' || 'OP-' || lpad(v_o.numero::text, 4, '0')))
        from public.pagos_ordenes_adjuntos a
       where a.orden_id = p_orden_id and a.deleted_at is null and a.tipo = 'comprobante_pago'), '[]'::jsonb);
  end if;

  v_motivo := format('Devolución del proveedor: NC %s del %s por $%s%s',
                     v_nc_numero, to_char(v_nc_fecha, 'DD/MM/YYYY'), translate(to_char(v_devuelto, 'FM999,999,999,990.00'), ',.', '.,'),
                     case when nullif(btrim(coalesce(p_motivo, '')), '') is not null then '. ' || btrim(p_motivo) else '' end);

  perform public.pagos_anular_orden(p_orden_id, v_motivo, p_user_id);

  v_id := public._pagos_emitir_orden(
    v_o.proveedor_id,
    jsonb_build_object(
      'fecha', v_o.fecha,
      'forma_pago', case when v_parcial then v_o.forma_pago else 'nota_credito' end,
      'referencia', v_o.referencia,
      'obs', format('Rehace la OP-%s por devolución del proveedor (NC %s).', lpad(v_o.numero::text, 4, '0'), v_nc_numero),
      'monto_pagado', round(v_restante, 2),
      'cheques', '[]'::jsonb
    ),
    v_lineas, v_adjuntos, p_user_id, false);

  return jsonb_build_object(
    'anulada', (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = p_orden_id),
    'orden',   (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_id),
    'facturas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.v_pagos_facturas v
                  where v.id in (select l2.factura_id from public.pagos_orden_lineas l2 where l2.orden_id = v_id)));
end $$;

comment on function public.pagos_devolucion_proveedor(bigint, jsonb, jsonb, text, jsonb, uuid) is
  'Devolución del proveedor (20260923g): anula la OP y la rehace con la NC (y la plata que quedó, si es parcial), en una transacción.';

revoke all on function public.pagos_devolucion_proveedor(bigint, jsonb, jsonb, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pagos_devolucion_proveedor(bigint, jsonb, jsonb, text, jsonb, uuid) to service_role;
