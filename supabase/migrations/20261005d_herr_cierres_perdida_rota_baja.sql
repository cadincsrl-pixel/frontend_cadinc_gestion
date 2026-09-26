-- =====================================================================
-- 20261005d — Pañol: cerrar lo perdido, roto o dado de baja en obra
-- (2026-09-26, revisión del circuito Pedidos y Stock, hallazgo C9)
--
-- Hasta hoy una herramienta que no iba a volver (se perdió, se rompió, se
-- quedó en la obra) solo se sacaba de «en obra» marcando la salida «No es
-- herramienta» (`ignorada`), que es falso, o por migración. Figuran 1.682
-- unidades en obra.
--
-- Regla: el cierre es una devolución más (misma fila, misma cuenta de
-- `devuelto`, mismo candado de cantidad) con `cierre` que dice qué pasó:
--   volvio        volvió al pañol (lo de siempre; null en las filas viejas)
--   perdida       se perdió en la obra
--   rota          se rompió, no vuelve
--   baja_en_obra  se quedó en la obra (se regaló, se consumió, se entregó al cliente)
-- Fuera de `volvio`, la nota (el motivo) es obligatoria: MOTIVO_REQUERIDO.
-- La única puerta sigue siendo registrar_retorno_herramientas, con un
-- parámetro nuevo `p_cierre` (default 'volvio': las llamadas viejas no cambian).
-- =====================================================================

alter table public.herr_entregas
  add column cierre text
  check (cierre is null or cierre in ('volvio', 'perdida', 'rota', 'baja_en_obra'));

comment on column public.herr_entregas.cierre is
  'Solo en devoluciones: qué pasó con la herramienta. null o volvio = volvió al pañol; perdida / rota / baja_en_obra = no vuelve (con nota). 20261005d.';

drop function if exists public.registrar_retorno_herramientas(jsonb, date, text, uuid);

create or replace function public.registrar_retorno_herramientas(
  p_items   jsonb,
  p_fecha   date,
  p_nota    text,
  p_user_id uuid,
  p_cierre  text default 'volvio'
) returns setof herr_entregas
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  it       record;
  s        public.herr_entregas;
  v_cant   numeric;
  v_nueva  public.herr_entregas;
  v_cierre text := coalesce(nullif(btrim(p_cierre), ''), 'volvio');
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_ITEMS' using errcode = 'P0001';
  end if;
  if v_cierre not in ('volvio', 'perdida', 'rota', 'baja_en_obra') then
    raise exception 'CIERRE_INVALIDO' using errcode = 'P0001', detail = v_cierre;
  end if;
  if v_cierre <> 'volvio' and coalesce(btrim(p_nota), '') = '' then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;

  for it in select (x->>'salida_id')::bigint as salida_id, (x->>'cantidad')::numeric as cantidad
              from jsonb_array_elements(p_items) x
  loop
    select * into s from public.herr_entregas where id = it.salida_id for update;
    if not found then
      raise exception 'SALIDA_NO_EXISTE' using errcode = 'P0001', detail = it.salida_id::text;
    end if;
    if s.sentido <> 'salida' or s.estado <> 'confirmada' then
      raise exception 'SALIDA_NO_DEVOLVIBLE' using errcode = 'P0001', detail = it.salida_id::text;
    end if;
    v_cant := coalesce(it.cantidad, s.cantidad - s.devuelto);
    if v_cant <= 0 or v_cant > s.cantidad - s.devuelto then
      raise exception 'CANTIDAD_INVALIDA'
        using errcode = 'P0001',
              detail = format('salida=%s pedido=%s en_obra=%s', it.salida_id, v_cant, s.cantidad - s.devuelto);
    end if;

    insert into public.herr_entregas (
      item_id, solicitud_id, obra_cod, descripcion, descripcion_norm, cantidad, unidad, material_id,
      fecha, sentido, origen, estado, salida_id, herramienta_id, nota, cierre,
      resuelto_por, resuelto_el, created_by, updated_by
    ) values (
      null, s.solicitud_id, s.obra_cod, s.descripcion, s.descripcion_norm, v_cant, s.unidad, s.material_id,
      p_fecha, 'devolucion', 'manual', 'confirmada', s.id, s.herramienta_id, nullif(btrim(p_nota), ''), v_cierre,
      p_user_id, now(), p_user_id, p_user_id
    ) returning * into v_nueva;

    return next v_nueva;
  end loop;
  return;
end;
$function$;

comment on function public.registrar_retorno_herramientas(jsonb, date, text, uuid, text) is
  'Retorno al pañol o cierre (perdida / rota / baja_en_obra, con motivo) de salidas confirmadas. Lockea cada salida. 20261005d.';

revoke all on function public.registrar_retorno_herramientas(jsonb, date, text, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_retorno_herramientas(jsonb, date, text, uuid, text) to service_role;
