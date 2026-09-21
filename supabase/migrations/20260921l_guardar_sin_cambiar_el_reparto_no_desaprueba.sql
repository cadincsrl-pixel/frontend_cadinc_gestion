-- =====================================================================
-- Guardar una factura sin tocar el reparto ya no la desaprueba (2026-09-21)
--
-- Encontrado probando el fix del separador decimal: abrí la ficha de la
-- factura 9 para reproducir el bug del total, apreté "Guardar cambios" sin
-- cambiar nada, y la factura pasó de `aprobada` a `pendiente`.
--
-- El trigger `trg_pagos_imputacion_desaprobar` desaprueba ante CUALQUIER
-- insert/update/delete sobre `pagos_imputaciones`, sin mirar valores. Eso
-- está bien: mover plata entre obras después de aprobada tiene que volver a
-- pasar por el aprobador. El problema es quién lo dispara.
--
-- `_pagos_reemplazar_imputaciones` borraba y reinsertaba SIEMPRE, y el modal
-- de editar manda el reparto en cada submit — también cuando lo único que se
-- corrigió fue la descripción o el número de factura, que ni siquiera están
-- en CAMPOS_QUE_DESAPRUEBAN. O sea: un delete + un insert idénticos a lo que
-- ya había, y una aprobación que se cae por nada.
--
-- Compará con el hermano `fn_pagos_factura_desaprobar`, que sí mira valor por
-- valor con `is distinct from`. Esta es la misma idea, un nivel más abajo.
--
-- El fix NO afloja la regla: las validaciones corren igual (obra archivada,
-- duplicados, que la suma cuadre), y cualquier reparto REALMENTE distinto
-- —otra obra, otro monto, otra obs, una fila más o una menos— borra,
-- reinserta y desaprueba como hasta hoy. Lo único que cambia es que un
-- reparto idéntico ya no toca la tabla, y entonces el trigger no se entera.
--
-- Por qué importa: hoy corregir el número de una factura aprobada la mandaba
-- de vuelta a la cola de Diego, que es el único aprobador del sistema. El
-- castigo caía justo sobre quien arregla un dato mal cargado.
-- =====================================================================

create or replace function public._pagos_reemplazar_imputaciones(
  p_factura_id bigint, p_imputaciones jsonb, p_user_id uuid
) returns void
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_imputable numeric(14,2);
  v_suma      numeric(14,2) := 0;
  v_n         int := 0;
  v_distintas int;
  v_igual     boolean;
  r           record;
  v_obra      record;
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
    select cod, coalesce(archivada, false) as archivada into v_obra from public.obras where cod = r.obra_cod;
    if not found then
      raise exception 'OBRA_INEXISTENTE' using errcode = 'P0001', detail = json_build_object('obra_cod', r.obra_cod)::text;
    end if;
    if v_obra.archivada then
      raise exception 'OBRA_ARCHIVADA' using errcode = 'P0001', detail = json_build_object('obra_cod', r.obra_cod)::text;
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

  -- ── Lo único nuevo ────────────────────────────────────────────────
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
  -- ──────────────────────────────────────────────────────────────────

  delete from public.pagos_imputaciones where factura_id = p_factura_id;
  insert into public.pagos_imputaciones (factura_id, obra_cod, monto, obs, created_by, updated_by)
  select p_factura_id, x.obra_cod, round(x.monto, 2), coalesce(x.obs, ''), p_user_id, p_user_id
    from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text);
end $function$;

comment on function public._pagos_reemplazar_imputaciones(bigint, jsonb, uuid) is
  'Reemplaza el reparto por obra de una factura. Si el reparto que llega es idéntico al guardado no toca la tabla, para que guardar sin cambios no dispare trg_pagos_imputacion_desaprobar (20260921l).';
