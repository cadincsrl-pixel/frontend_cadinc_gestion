-- =====================================================================
-- Cartera de cheques recibidos, fase 3: la vista para la pantalla de
-- Tesorería y el alta a mano sin cobro (2026-09-25, serie 20260930)
--
-- v_cheques_recibidos: cada cheque con DE DÓNDE vino (cobro de Logística y
-- su empresa, o cobro de Ventas y su cliente) y A DÓNDE fue (la OP donde se
-- endosó y su proveedor). `recibido_de` es la empresa o el cliente; `vencido`
-- = en cartera con la fecha de cobro pasada (casi seguro ya se depositó:
-- los depósitos todavía no se registran). `busq` para el buscador.
--
-- cheques_recibidos_registrar: con p_cobro_id null el cheque entra como
-- origen 'manual' (alta desde Tesorería). Mismo control de duplicados y el
-- mismo vínculo con los endosos ya emitidos (_cartera_vincular_endosos).
-- =====================================================================

create or replace view public.v_cheques_recibidos as
select r.id, r.numero, r.numero_norm, r.banco, r.librador, r.librador_cuit, r.fecha_cobro, r.importe, r.es_echeq,
       r.origen, r.estado, r.obs, r.created_at, r.updated_at,
       r.cobro_id, r.cobro_adjunto_id, r.ventas_cobro_medio_id, r.pagos_cheque_id,
       et.nombre                                   as empresa_nombre,
       vc.id                                       as ventas_cobro_id,
       vcl.razon_social                            as cliente_nombre,
       coalesce(et.nombre, vcl.razon_social)       as recibido_de,
       coalesce(c.cobrado_en, vc.fecha)            as recibido_el,
       o.id                                        as orden_id,
       o.numero                                    as op_numero,
       o.fecha                                     as op_fecha,
       pp.id                                       as proveedor_id,
       pp.razon_social                             as proveedor_nombre,
       (r.estado = 'en_cartera' and r.fecha_cobro < current_date) as vencido,
       public.norm_txt(concat_ws(' ', r.numero, r.banco, r.librador, r.librador_cuit, et.nombre, vcl.razon_social, pp.razon_social,
                                 'OP-' || lpad(o.numero::text, 4, '0'))) as busq
  from public.cheques_recibidos r
  left join public.cobros c                  on c.id = r.cobro_id
  left join public.empresas_transportistas et on et.id = c.empresa_id
  left join public.ventas_cobro_medios vm    on vm.id = r.ventas_cobro_medio_id
  left join public.ventas_cobros vc          on vc.id = vm.cobro_id
  left join public.ventas_clientes vcl       on vcl.id = vc.cliente_id
  left join public.pagos_cheques pc          on pc.id = r.pagos_cheque_id
  left join public.pagos_ordenes o           on o.id = pc.orden_id
  left join public.pagos_proveedores pp      on pp.id = o.proveedor_id;

comment on view public.v_cheques_recibidos is
  'Cartera de cheques recibidos con su origen (cobro de Logística / Ventas) y su destino (OP y proveedor). Pantalla: Contabilidad › Tesorería › Cheques recibidos. 20260930n.';

revoke all on public.v_cheques_recibidos from anon, authenticated;
grant select on public.v_cheques_recibidos to service_role;

-- ── Alta a mano sin cobro ───────────────────────────────────────────────
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
            case when p_cobro_id is null then 'manual' else 'logistica_cobro' end,
            p_cobro_id, p_adjunto_id,
            coalesce(nullif(btrim(e ->> 'obs'), ''), p_obs, 'Leído del adjunto del cobro'), p_user_id, p_user_id)
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

  v_endos := public._cartera_vincular_endosos(v_ids);

  return jsonb_build_object('nuevos', v_nuevos, 'ya_estaban', v_ya, 'endosados', v_endos, 'ya_estaban_numeros', to_jsonb(v_ya_nums));
end $$;

revoke all on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.cheques_recibidos_registrar(integer, bigint, jsonb, uuid, text) to service_role;
