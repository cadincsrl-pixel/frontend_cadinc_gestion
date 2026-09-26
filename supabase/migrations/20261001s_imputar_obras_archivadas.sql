-- Compras: se puede imputar a una obra archivada (dueño, 25/09: «el centro de costo sigue teniendo
-- que estar presente en la contabilidad aunque esté archivada la obra»). Archivar una obra la saca
-- de la operación, no de la contabilidad: una factura que llega tarde, o la reconstrucción de
-- jul–sep, tiene que poder ir a su centro de costo.
-- Se saca el OBRA_ARCHIVADA de _pagos_reemplazar_imputaciones (la usan pagos_imputar_factura,
-- pagos_imputar_lote y la edición del reparto). El resto de la función queda igual.

CREATE OR REPLACE FUNCTION public._pagos_reemplazar_imputaciones(p_factura_id bigint, p_imputaciones jsonb, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_imputable numeric(14,2);
  v_suma      numeric(14,2) := 0;
  v_n         int := 0;
  v_distintas int;
  v_igual     boolean;
  r           record;
begin
  select imputable into v_imputable from public.pagos_facturas where id = p_factura_id;
  if p_imputaciones is null or jsonb_typeof(p_imputaciones) <> 'array' or jsonb_array_length(p_imputaciones) = 0 then
    raise exception 'IMPUTACION_REQUERIDA' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text) loop
    if r.obra_cod is null or btrim(r.obra_cod) = '' or r.monto is null or r.monto <= 0 then
      raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('obra_cod', r.obra_cod, 'monto', r.monto)::text;
    end if;
    -- Una obra archivada sigue siendo centro de costo (20261001s): solo tiene que existir.
    if not exists (select 1 from public.obras where cod = r.obra_cod) then
      raise exception 'OBRA_INEXISTENTE' using errcode = 'P0001', detail = json_build_object('obra_cod', r.obra_cod)::text;
    end if;
    v_suma := v_suma + r.monto;
    v_n := v_n + 1;
  end loop;
  select count(distinct x.obra_cod) into v_distintas from jsonb_to_recordset(p_imputaciones) as x(obra_cod text);
  if v_distintas <> v_n then
    raise exception 'IMPUTACION_DUPLICADA' using errcode = 'P0001';
  end if;
  if abs(v_suma - v_imputable) > 0.01 then
    raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
      detail = json_build_object('suma', v_suma, 'imputable', v_imputable)::text;
  end if;

  -- ¿El reparto que llega es el MISMO que ya está guardado? Se compara con
  -- los valores tal como quedarían en la tabla (monto redondeado a 2, obs
  -- vacía en vez de null), en los dos sentidos: así una fila de más o de
  -- menos también cuenta como cambio.
  select not exists (
           select x.obra_cod, round(x.monto, 2) as monto, coalesce(x.obs, '') as obs
             from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text)
           except
           select obra_cod, monto, obs from public.pagos_imputaciones where factura_id = p_factura_id
         )
     and not exists (
           select obra_cod, monto, obs from public.pagos_imputaciones where factura_id = p_factura_id
           except
           select x.obra_cod, round(x.monto, 2), coalesce(x.obs, '')
             from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text)
         )
    into v_igual;
  if v_igual then
    return;   -- nada que escribir, y por lo tanto nada que desaprobar
  end if;

  delete from public.pagos_imputaciones where factura_id = p_factura_id;
  insert into public.pagos_imputaciones (factura_id, obra_cod, monto, obs, created_by, updated_by)
  select p_factura_id, x.obra_cod, round(x.monto, 2), coalesce(x.obs, ''), p_user_id, p_user_id
    from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text);
end $function$;

-- Las que quedaron afuera por obra archivada en 20261001p/q.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
begin
  perform public.pagos_imputar_lote(array[318]::bigint[], 12, 'CC-019', u);        -- Vancar, Hipódromo
  perform public.pagos_imputar_lote(array[461]::bigint[], 2, 'CC-021', u);         -- Castro, Pasaje Kotch
  perform public.pagos_imputar_lote(array[557, 583]::bigint[], 2, 'CC-009', u);    -- Tynet + Todovision, Misión Salta
  perform public.pagos_imputar_lote(array[734]::bigint[], 2, 'CC-002', u);         -- Singular, Arcor
end $m$;
