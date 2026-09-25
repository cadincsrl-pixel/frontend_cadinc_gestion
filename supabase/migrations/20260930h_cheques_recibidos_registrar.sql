-- =====================================================================
-- Cartera de cheques recibidos, fase 2: se cargan solos al adjuntar la
-- liquidación al cobro de Logística (2026-09-25, serie 20260930)
--
-- El backend (logistica/cobros/adjuntos.service.ts) lee en segundo plano el
-- comprobante o la liquidación que se adjunta al cobro con el lector de
-- cheques (IA) y llama a esta RPC con lo que encontró. Única puerta de
-- entrada desde Logística a cheques_recibidos.
--
-- cheques_recibidos_registrar(cobro, adjunto, cheques, user) → jsonb:
--   · Inserta cada cheque (origen logistica_cobro). Uno que ya está en la
--     cartera (mismo número sin ceros e importe) no se duplica: cuenta como
--     «ya_estaba» (la liquidación y la foto del mismo pago, por ejemplo).
--   · Si alguno ya fue ENDOSADO en una OP emitida (se pagó antes de adjuntar
--     la liquidación), completa el librador de esa fila si decía «No
--     informado…» y deja el cheque de la cartera `endosado`.
--   · Devuelve { nuevos, ya_estaban, endosados }.
-- Borrar el adjunto saca de la cartera sus cheques que seguían en_cartera
-- (lo hace el backend al borrar).
-- =====================================================================

create or replace function public.cheques_recibidos_registrar(
  p_cobro_id   integer,
  p_adjunto_id bigint,
  p_cheques    jsonb,
  p_user_id    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e          jsonb;
  v_nuevos   int := 0;
  v_ya       int := 0;
  v_endos    int := 0;
  v_id       bigint;
  v_ids      bigint[] := '{}';
begin
  if jsonb_typeof(p_cheques) <> 'array' then
    raise exception 'CHEQUES_INVALIDOS' using errcode = 'P0001';
  end if;

  for e in select * from jsonb_array_elements(p_cheques) loop
    if coalesce(btrim(e ->> 'numero'), '') = '' or coalesce((e ->> 'importe')::numeric, 0) <= 0 then continue; end if;
    insert into public.cheques_recibidos (numero, banco, librador, librador_cuit, fecha_cobro, importe, es_echeq,
                                          origen, cobro_id, cobro_adjunto_id, obs, created_by, updated_by)
    values (btrim(e ->> 'numero'), nullif(btrim(e ->> 'banco'), ''), nullif(btrim(e ->> 'librador'), ''),
            nullif(regexp_replace(coalesce(e ->> 'librador_cuit', ''), '\D', '', 'g'), ''),
            nullif(e ->> 'fecha_cobro', '')::date, round((e ->> 'importe')::numeric, 2), (e ->> 'es_echeq')::boolean,
            'logistica_cobro', p_cobro_id, p_adjunto_id, 'Leído del adjunto del cobro', p_user_id, p_user_id)
    on conflict (numero_norm, importe) do nothing
    returning id into v_id;
    if v_id is null then
      v_ya := v_ya + 1;
    else
      v_nuevos := v_nuevos + 1;
      v_ids := v_ids || v_id;
    end if;
    v_id := null;
  end loop;

  -- Los que ya se habían endosado antes de adjuntar la liquidación.
  update public.pagos_cheques c
     set librador = r.librador || coalesce(' · CUIT ' || r.librador_cuit, ''),
         banco    = coalesce(nullif(btrim(c.banco), ''), r.banco)
    from public.cheques_recibidos r, public.pagos_ordenes o
   where r.id = any(v_ids) and o.id = c.orden_id and o.estado = 'emitida' and not c.es_propio
     and r.numero_norm = coalesce(nullif(ltrim(regexp_replace(c.numero, '\D', '', 'g'), '0'), ''), '0')
     and r.importe = round(c.monto, 2)
     and coalesce(btrim(c.librador), '') in ('', 'No informado en el detalle del endoso')
     and r.librador is not null;

  with m as (
    select distinct on (r.id) r.id rid, c.id cid
      from public.cheques_recibidos r
      join public.pagos_cheques c on not c.es_propio
       and r.numero_norm = coalesce(nullif(ltrim(regexp_replace(c.numero, '\D', '', 'g'), '0'), ''), '0')
       and r.importe = round(c.monto, 2)
      join public.pagos_ordenes o on o.id = c.orden_id and o.estado = 'emitida'
     where r.id = any(v_ids) and r.estado = 'en_cartera'
       and not exists (select 1 from public.cheques_recibidos x where x.pagos_cheque_id = c.id)
     order by r.id, c.id
  )
  update public.cheques_recibidos r set estado = 'endosado', pagos_cheque_id = m.cid, updated_at = now(), updated_by = p_user_id
    from m where r.id = m.rid;
  get diagnostics v_endos = row_count;

  return jsonb_build_object('nuevos', v_nuevos, 'ya_estaban', v_ya, 'endosados', v_endos);
end $$;

comment on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid) is
  'Carga en la cartera los cheques leídos del adjunto de un cobro de Logística; no duplica y vincula los ya endosados. 20260930h.';

revoke all on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid) to service_role;
