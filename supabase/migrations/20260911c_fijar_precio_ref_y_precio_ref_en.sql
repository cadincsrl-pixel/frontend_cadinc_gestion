-- 20260911c — Dos funciones alrededor del historial (20260911a).
--
-- fijar_precio_ref(material, precio, fuente, item, user): el UNICO camino por el
-- que el backend toca precio_ref. Deja fuente, renglon y usuario en config local
-- (que lee el trigger del historial) y hace el UPDATE. Devuelve el precio
-- anterior. Rechaza precio negativo y fuente desconocida. SECURITY DEFINER,
-- EXECUTE solo para service_role (§9): la validacion de permiso corre en el
-- backend ANTES, como el resto de las RPC.
--
-- precio_ref_en(material, fecha): que precio de referencia tenia la ficha ese
-- dia, segun el historial. NULL si el historial no llega tan atras (hoy: casi
-- siempre, porque arranco en 20260911a). Devuelve NULL y no el precio actual a
-- proposito: quien lo llame decide si usa "hoy", y lo dice.

create or replace function public.fijar_precio_ref(
  p_material_id integer,
  p_precio      numeric,
  p_fuente      text    default 'manual',
  p_item_id     integer default null,
  p_user_id     uuid    default null
) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_anterior numeric;
begin
  if p_precio is null or p_precio < 0 then
    raise exception 'PRECIO_INVALIDO' using errcode = 'P0001';
  end if;
  if p_fuente not in ('manual','compra','ultima_compra','migracion','sql','backfill') then
    raise exception 'FUENTE_INVALIDA' using errcode = 'P0001', detail = p_fuente;
  end if;
  select precio_ref into v_anterior from stock_materiales where id = p_material_id for update;
  if not found then
    raise exception 'MATERIAL_INEXISTENTE' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.precio_fuente', p_fuente, true);
  perform set_config('cadinc.precio_item',   coalesce(p_item_id::text, ''), true);
  perform set_config('cadinc.precio_user',   coalesce(p_user_id::text, ''), true);
  update stock_materiales
     set precio_ref = p_precio,
         updated_by = coalesce(p_user_id, updated_by)
   where id = p_material_id;
  return v_anterior;
end $$;

revoke all on function public.fijar_precio_ref(integer, numeric, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.fijar_precio_ref(integer, numeric, text, integer, uuid) to service_role;

create or replace function public.precio_ref_en(p_material_id integer, p_fecha date)
returns numeric language sql stable as $$
  select h.precio
    from public.stock_materiales_precios h
   where h.material_id = p_material_id
     and h.desde::date <= p_fecha
   order by h.desde desc, h.id desc
   limit 1
$$;
