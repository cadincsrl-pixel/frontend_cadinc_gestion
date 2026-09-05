-- 20260905o — RPC fusionar_tipo_herramienta: unir dos tipos del catálogo de herramientas
--
-- Cuando aparecen dos tipos que son lo mismo ("Alargue 10 m" y "Prolongación
-- 10m"), el catálogo ofrece "Fusionar con…": el ORIGEN se funde en el DESTINO
-- y queda de baja. Todo lo que apuntaba al origen pasa al destino en una sola
-- transacción:
--   1) renglones de pedido (material_id + descripción si llevaba el nombre del
--      origen), con evento 'correccion' por renglón;
--   2) cuenta del cliente: solo la descripción de las filas no cobradas (una
--      herramienta no debería estar ahí, pero si está que diga el nombre bueno);
--   3) pañol (herr_entregas): material_id + descripción; las filas atadas a un
--      renglón las sincroniza el trigger del punto 1, las sueltas (salidas a
--      mano, retornos) van acá;
--   4) movimientos de stock, por si alguno quedó de cuando era "material";
--   5) el destino hereda los sinónimos del origen y su nombre como sinónimo;
--      el origen queda activo=false con la nota de en quién se fundió.
-- SECURITY DEFINER: la llama el backend con service_role (permiso
-- herramientas.eliminacion validado antes). Recibe p_user_id explícito.

create or replace function public.fusionar_tipo_herramienta(p_origen integer, p_destino integer, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o public.stock_materiales%rowtype;
  v_d public.stock_materiales%rowtype;
  v_items int := 0; v_entregas int := 0; v_movs int := 0; v_mcc int := 0;
  v_nota text;
begin
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'FUSION_MISMO_TIPO';
  end if;

  -- lock en orden fijo: dos fusiones cruzadas no se traban entre sí
  perform 1 from public.stock_materiales where id = least(p_origen, p_destino) for update;
  perform 1 from public.stock_materiales where id = greatest(p_origen, p_destino) for update;
  select * into v_o from public.stock_materiales where id = p_origen;
  select * into v_d from public.stock_materiales where id = p_destino;
  if v_o.id is null or v_o.clase <> 'herramienta' then raise exception 'ORIGEN_NO_ES_TIPO'; end if;
  if v_d.id is null or v_d.clase <> 'herramienta' then raise exception 'DESTINO_NO_ES_TIPO'; end if;
  if not v_d.activo then raise exception 'DESTINO_DE_BAJA'; end if;

  v_nota := 'Tipo fusionado: "' || v_o.nombre || '" (#' || v_o.id || ') → "' || v_d.nombre || '" (#' || v_d.id || ')';
  select count(*) into v_entregas from public.herr_entregas where material_id = v_o.id;

  -- 1) renglones de pedido
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado, v_nota,
         jsonb_build_object('motivo', 'fusion_tipo_herramienta', 'material_anterior', v_o.id, 'material_nuevo', v_d.id, 'user_id', p_user_id)
    from public.solicitud_compra_item i
   where i.material_id = v_o.id;

  update public.solicitud_compra_item i
     set material_id = v_d.id,
         descripcion = case when i.descripcion = v_o.nombre then v_d.nombre else i.descripcion end
   where i.material_id = v_o.id;
  get diagnostics v_items = row_count;

  -- 2) cuenta del cliente (solo el nombre, solo lo no cobrado)
  update public.materiales_a_cuenta_cliente c
     set descripcion = v_d.nombre, updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id = v_d.id and c.descripcion = v_o.nombre and c.cobro_id is null;
  get diagnostics v_mcc = row_count;

  -- 3) pañol
  update public.herr_entregas e
     set material_id = v_d.id, updated_by = p_user_id, updated_at = now()
   where e.material_id = v_o.id;
  update public.herr_entregas e
     set descripcion = v_d.nombre, descripcion_norm = public.norm_txt(v_d.nombre), updated_by = p_user_id, updated_at = now()
   where e.material_id = v_d.id and e.descripcion = v_o.nombre;

  -- 4) stock (no debería haber)
  update public.stock_movimientos set material_id = v_d.id where material_id = v_o.id;
  get diagnostics v_movs = row_count;

  -- 5) sinónimos al destino, baja del origen
  update public.stock_materiales
     set alias = array(
           select distinct x
             from unnest(coalesce(alias, '{}'::text[]) || coalesce(v_o.alias, '{}'::text[]) || array[public.norm_txt(v_o.nombre)]) as x
            where coalesce(x, '') <> '' and public.norm_txt(x) <> public.norm_txt(v_d.nombre)),
         updated_by = p_user_id, updated_at = now()
   where id = v_d.id;

  update public.stock_materiales
     set activo = false,
         obs = coalesce(obs || ' · ', '') || 'Fusionado en "' || v_d.nombre || '" (#' || v_d.id || ') el '
               || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') || '.',
         updated_by = p_user_id, updated_at = now()
   where id = v_o.id;

  return jsonb_build_object(
    'origen_id', v_o.id, 'origen', v_o.nombre, 'destino_id', v_d.id, 'destino', v_d.nombre,
    'renglones', v_items, 'entregas', v_entregas, 'movimientos', v_movs, 'cuenta_cliente', v_mcc);
end
$$;

revoke all on function public.fusionar_tipo_herramienta(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.fusionar_tipo_herramienta(integer, integer, uuid) to service_role;
