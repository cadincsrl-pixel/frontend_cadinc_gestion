-- El certificado sale con los precios cargados: ya no sube al catálogo (24/09).
--
-- Desde 20260911i, emitir_certificado_cliente llevaba al precio del catálogo
-- (a la fecha de corte) todo renglón con ficha que estuviera por DEBAJO
-- (decisión del 08/09: "me lo quedo por gestión de compras"). El 24/09, al
-- cargar el certificado N°1 de Farmacia America que Diego ya le había dado al
-- cliente en papel, eso subía 16 renglones en $241.923,89 y el certificado no
-- daba igual que el papel. El dueño: "deberían salir con los precios que se
-- cargó en el sistema".
--
-- Cambio: se saca el loop que retasaba. Nada cambia de precio al emitir. La
-- función devuelve `bajo_catalogo` (cuántos renglones certificados quedaron
-- por debajo del catálogo a la fecha de corte) y `bajo_catalogo_dif` (cuánto
-- sumaría llevarlos al catálogo), sólo como información; la pantalla avisa
-- ANTES de emitir, que es cuando todavía se pueden revisar. `retasados` sigue
-- en la respuesta, siempre 0, para no romper a quien lo lee.
--
-- Lo demás igual: lock por obra, número correlativo, elegibilidad, selección de
-- renglones (p_item_ids), y el freeze de fn_mcc_congelada después de emitir.

create or replace function public.emitir_certificado_cliente(
  p_obra_cod text, p_fecha_corte date, p_mano_de_obra numeric default 0,
  p_obs text default null, p_user_id uuid default null, p_item_ids integer[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_obra       obras%rowtype;
  v_numero     integer;
  v_cert_id    integer;
  v_sin_precio integer;
  v_renglones  integer;
  v_materiales numeric;
  v_invalidos  integer;
  v_bajo       integer;
  v_bajo_dif   numeric;
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

  update materiales_a_cuenta_cliente c
     set certificado_id = v_cert_id, updated_by = p_user_id, updated_at = now()
   where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
     and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
     and c.fecha_resolucion <= p_fecha_corte and c.precio_unit > 0
     and (p_item_ids is null or c.id = any(p_item_ids));
  get diagnostics v_renglones = row_count;

  select coalesce(sum(precio_total), 0) into v_materiales
    from materiales_a_cuenta_cliente where certificado_id = v_cert_id;

  -- Sólo información: cuántos quedaron por debajo del catálogo a la fecha de corte.
  select count(*), coalesce(sum(round(c.cantidad * x.cat, 2) - c.precio_total), 0)
    into v_bajo, v_bajo_dif
    from materiales_a_cuenta_cliente c
    join solicitud_compra_item i on i.id = c.item_id
    join stock_materiales m on m.id = i.material_id
    cross join lateral (select coalesce(precio_ref_en(m.id, p_fecha_corte), m.precio_ref) as cat) x
   where c.certificado_id = v_cert_id
     and m.precio_ref > 0 and unidad_compatible(c.unidad, m.unidad)
     and x.cat > c.precio_unit;

  update certificados_cliente
     set total_materiales = v_materiales, total = v_materiales + p_mano_de_obra,
         renglones = v_renglones, updated_at = now()
   where id = v_cert_id;

  return jsonb_build_object(
    'id', v_cert_id, 'numero', v_numero, 'obra_cod', p_obra_cod, 'fecha_corte', p_fecha_corte,
    'mano_de_obra', p_mano_de_obra, 'total_materiales', v_materiales, 'total', v_materiales + p_mano_de_obra,
    'renglones', v_renglones, 'retasados', 0, 'sin_precio_excluidos', v_sin_precio,
    'bajo_catalogo', v_bajo, 'bajo_catalogo_dif', v_bajo_dif,
    'seleccion', p_item_ids is not null);
end $function$;
