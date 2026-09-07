-- El comprobante entra en la misma transacción que el gasto.
--
-- La versión de `20260908g` insertaba el gasto y la carga juntos pero dejaba el
-- comprobante para un UPDATE posterior. Ese UPDATE puede fallar contra el
-- índice único de hash (dos personas subiendo la misma foto), y entonces queda
-- un gasto cargado sin su comprobante y un archivo huérfano en el bucket. Con
-- los campos acá, o entra todo o no entra nada.
create or replace function public.sp_aridos_gasto_con_carga(
  p_gasto jsonb, p_carga jsonb, p_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cod    text;
  v_gasto  public.aridos_gastos;
  v_carga  public.aridos_cargas_combustible;
begin
  select codigo into v_cod from public.aridos_gastos_categorias
   where id = (p_gasto->>'categoria_id')::int;
  if v_cod is null then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  -- Un gasto de combustible sin litros no sirve para nada: el litraje es el
  -- dato por el que se carga (precio por litro, consumo, km recorridos).
  if v_cod = 'combustible' and p_carga is null then
    raise exception 'CARGA_REQUERIDA: un gasto de combustible necesita litros';
  end if;
  if v_cod <> 'combustible' and p_carga is not null then
    raise exception 'CARGA_NO_PERMITIDA: solo combustible lleva litros';
  end if;

  insert into public.aridos_gastos (
    fecha, categoria_id, unidad_id, monto, descripcion, proveedor, metodo_pago,
    comprobante_nro, comprobante_bucket, comprobante_path, comprobante_hash,
    obs, created_by, updated_by)
  values (
    (p_gasto->>'fecha')::date, (p_gasto->>'categoria_id')::int,
    nullif(p_gasto->>'unidad_id','')::int, (p_gasto->>'monto')::numeric,
    p_gasto->>'descripcion', p_gasto->>'proveedor', p_gasto->>'metodo_pago',
    p_gasto->>'comprobante_nro', p_gasto->>'comprobante_bucket',
    p_gasto->>'comprobante_path', p_gasto->>'comprobante_hash',
    p_gasto->>'obs', p_user_id, p_user_id)
  returning * into v_gasto;

  if p_carga is not null then
    insert into public.aridos_cargas_combustible (
      gasto_id, litros, odometro_km, tipo_combustible, tanque_lleno, warnings, obs,
      created_by, updated_by)
    values (
      v_gasto.id, (p_carga->>'litros')::numeric, nullif(p_carga->>'odometro_km','')::int,
      coalesce(p_carga->>'tipo_combustible','gasoil'),
      coalesce((p_carga->>'tanque_lleno')::boolean, true),
      coalesce(p_carga->'warnings', '[]'::jsonb), p_carga->>'obs',
      p_user_id, p_user_id)
    returning * into v_carga;
  end if;

  return jsonb_build_object('gasto', to_jsonb(v_gasto), 'carga', to_jsonb(v_carga));
end $$;

revoke all on function public.sp_aridos_gasto_con_carga(jsonb, jsonb, uuid) from public;
grant execute on function public.sp_aridos_gasto_con_carga(jsonb, jsonb, uuid) to service_role;
