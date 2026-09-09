-- 20260911v — Al presentar un certificado se pueden elegir QUE renglones
-- entran (user, 08/09: "por si el cliente no quiere certificar todos hasta la
-- fecha"). Nuevo parametro p_item_ids (ids de materiales_a_cuenta_cliente):
-- null = todos los elegibles hasta el corte, como hasta ahora; con lista, solo
-- esos, y cada uno tiene que ser elegible (misma obra, a cargo del cliente, no
-- pagado directo, sin cobrar, sin certificar, fecha <= corte, precio > 0) o la
-- emision se rechaza entera con ITEM_NO_CERTIFICABLE.
-- La firma cambia (se agrega un parametro con default): se borra la anterior
-- para que PostgREST no tenga dos candidatas.

drop function if exists public.emitir_certificado_cliente(text, date, numeric, text, uuid);

create or replace function public.emitir_certificado_cliente(
  p_obra_cod     text,
  p_fecha_corte  date,
  p_mano_de_obra numeric default 0,
  p_obs          text default null,
  p_user_id      uuid default null,
  p_item_ids     integer[] default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra       obras%rowtype;
  v_numero     integer;
  v_cert_id    integer;
  v_sin_precio integer;
  v_retasados  integer := 0;
  v_renglones  integer;
  v_materiales numeric;
  v_invalidos  integer;
  r            record;
begin
  if p_mano_de_obra is null or p_mano_de_obra < 0 then
    raise exception 'MANO_DE_OBRA_INVALIDA' using errcode = 'P0001';
  end if;
  if p_item_ids is not null and array_length(p_item_ids, 1) is null then
    raise exception 'SIN_RENGLONES' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('certificado_cliente:' || p_obra_cod));

  select * into v_obra from obras where cod = p_obra_cod;
  if not found then raise exception 'OBRA_INEXISTENTE' using errcode = 'P0001'; end if;
  if v_obra.es_deposito then raise exception 'OBRA_ES_DEPOSITO' using errcode = 'P0001'; end if;
  if v_obra.archivada then raise exception 'OBRA_ARCHIVADA' using errcode = 'P0001'; end if;

  -- Con lista: cada id tiene que ser elegible. Si uno no lo es, no se emite nada.
  if p_item_ids is not null then
    select count(*) into v_invalidos
      from unnest(p_item_ids) as sel(id)
      left join materiales_a_cuenta_cliente c on c.id = sel.id
     where c.id is null or c.obra_cod <> p_obra_cod or c.certificado_id is not null or c.cobro_id is not null
        or c.a_cargo_de <> 'cliente' or c.pagado_por <> 'cadinc'
        or c.fecha_resolucion > p_fecha_corte or coalesce(c.precio_unit, 0) <= 0;
    if v_invalidos > 0 then
      raise exception 'ITEM_NO_CERTIFICABLE' using errcode = 'P0001',
        detail = format('%s renglon(es) no se pueden certificar (otra obra, ya certificado o cobrado, a cargo de CADINC, pago directo, posterior al corte o sin precio)', v_invalidos);
    end if;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from certificados_cliente where obra_cod = p_obra_cod;

  -- Los que se quedan afuera por estar en $0 (siempre sobre el universo hasta el corte).
  select count(*) into v_sin_precio
    from materiales_a_cuenta_cliente c
   where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
     and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
     and c.fecha_resolucion <= p_fecha_corte and coalesce(c.precio_unit, 0) <= 0;

  insert into certificados_cliente (obra_cod, numero, fecha_corte, mano_de_obra, obs, emitido_por)
  values (p_obra_cod, v_numero, p_fecha_corte, p_mano_de_obra, nullif(p_obs, ''), p_user_id)
  returning id into v_cert_id;

  perform set_config('cadinc.mcc_fuente', 'certificado', true);
  perform set_config('cadinc.mcc_lote', v_cert_id::text, true);
  perform set_config('cadinc.precio_user', coalesce(p_user_id::text, ''), true);
  for r in
    select c.id, c.cantidad, c.precio_unit,
           coalesce(precio_ref_en(m.id, p_fecha_corte), m.precio_ref) as precio_catalogo
      from materiales_a_cuenta_cliente c
      join solicitud_compra_item i on i.id = c.item_id
      join stock_materiales m on m.id = i.material_id
     where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
       and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
       and c.fecha_resolucion <= p_fecha_corte and c.precio_unit > 0
       and (p_item_ids is null or c.id = any(p_item_ids))
       and m.precio_ref > 0 and unidad_compatible(c.unidad, m.unidad)
       for update of c
  loop
    if r.precio_catalogo > r.precio_unit then
      update materiales_a_cuenta_cliente
         set precio_unit = r.precio_catalogo,
             precio_total = round(r.cantidad * r.precio_catalogo, 2),
             updated_by = p_user_id, updated_at = now()
       where id = r.id;
      v_retasados := v_retasados + 1;
    end if;
  end loop;

  update materiales_a_cuenta_cliente c
     set certificado_id = v_cert_id, updated_by = p_user_id, updated_at = now()
   where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
     and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
     and c.fecha_resolucion <= p_fecha_corte and c.precio_unit > 0
     and (p_item_ids is null or c.id = any(p_item_ids));
  get diagnostics v_renglones = row_count;

  select coalesce(sum(precio_total), 0) into v_materiales
    from materiales_a_cuenta_cliente where certificado_id = v_cert_id;

  update certificados_cliente
     set total_materiales = v_materiales, total = v_materiales + p_mano_de_obra,
         renglones = v_renglones, updated_at = now()
   where id = v_cert_id;

  return jsonb_build_object(
    'id', v_cert_id, 'numero', v_numero, 'obra_cod', p_obra_cod, 'fecha_corte', p_fecha_corte,
    'mano_de_obra', p_mano_de_obra, 'total_materiales', v_materiales, 'total', v_materiales + p_mano_de_obra,
    'renglones', v_renglones, 'retasados', v_retasados, 'sin_precio_excluidos', v_sin_precio,
    'seleccion', p_item_ids is not null);
end $$;

revoke all on function public.emitir_certificado_cliente(text, date, numeric, text, uuid, integer[]) from public, anon, authenticated;
grant execute on function public.emitir_certificado_cliente(text, date, numeric, text, uuid, integer[]) to service_role;
