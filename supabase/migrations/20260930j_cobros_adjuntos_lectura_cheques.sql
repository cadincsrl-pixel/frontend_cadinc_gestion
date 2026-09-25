-- =====================================================================
-- Cartera de cheques: aviso de la lectura en el adjunto del cobro y carga
-- a mano (2026-09-25, serie 20260930)
--
-- Pedido del dueño: «si no tengo token para la IA, ¿lo puedo hacer a mano?
-- Sería bueno que algo me avise que se está procesando para que no se haga
-- dos veces».
--
-- 1. cobros_adjuntos.cheques_lectura: null (no se lee) / 'leyendo' / 'ok' /
--    'sin_cheques' / 'error', con cheques_resultado { nuevos, ya_estaban,
--    endosados, motivo, modelo } y cheques_lectura_at. La pantalla lo muestra
--    y se refresca mientras dice 'leyendo'; mientras tanto no deja cargar a
--    mano. Un 'leyendo' de más de 5 minutos se considera caído (reinicio del
--    servidor) y se puede volver a leer.
-- 2. cheques_recibidos_registrar suma p_obs (la carga a mano manda
--    «Cargado a mano»; la lectura, el modelo). La firma vieja se reemplaza.
-- =====================================================================

alter table public.cobros_adjuntos
  add column cheques_lectura    text check (cheques_lectura in ('leyendo', 'ok', 'sin_cheques', 'error')),
  add column cheques_resultado  jsonb,
  add column cheques_lectura_at timestamptz;

comment on column public.cobros_adjuntos.cheques_lectura is
  'Lectura de cheques del adjunto para la cartera (20260930h/j): leyendo / ok / sin_cheques / error. Null = este tipo no se lee.';

drop function if exists public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid);

create or replace function public.cheques_recibidos_registrar(
  p_cobro_id   integer,
  p_adjunto_id bigint,
  p_cheques    jsonb,
  p_user_id    uuid,
  p_obs        text default null
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
  v_ya_nums  text[] := '{}';
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
            'logistica_cobro', p_cobro_id, p_adjunto_id, coalesce(p_obs, 'Leído del adjunto del cobro'), p_user_id, p_user_id)
    on conflict (numero_norm, importe) do nothing
    returning id into v_id;
    if v_id is null then
      v_ya := v_ya + 1;
      v_ya_nums := v_ya_nums || btrim(e ->> 'numero');
    else
      v_nuevos := v_nuevos + 1;
      v_ids := v_ids || v_id;
    end if;
    v_id := null;
  end loop;

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

  return jsonb_build_object('nuevos', v_nuevos, 'ya_estaban', v_ya, 'endosados', v_endos, 'ya_estaban_numeros', to_jsonb(v_ya_nums));
end $$;

comment on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid, text) is
  'Carga en la cartera cheques recibidos en un cobro de Logística (leídos del adjunto o a mano); no duplica y vincula los ya endosados. 20260930h/j.';

revoke all on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid, text) to service_role;
