-- 20260904be — Solo una salida CONFIRMADA puede volver al pañol
-- User (2026-09-04): el flujo es Sin revisar → Confirmar / No es → (en obra) → Volvió.
-- Una salida sin revisar o "a revisar" no se devuelve hasta que alguien la mire.

create or replace function public.registrar_retorno_herramientas(
  p_items   jsonb,
  p_fecha   date,
  p_nota    text,
  p_user_id uuid
)
returns setof public.herr_entregas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it       record;
  s        public.herr_entregas;
  v_cant   numeric;
  v_nueva  public.herr_entregas;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_ITEMS' using errcode = 'P0001';
  end if;

  for it in select (x->>'salida_id')::bigint as salida_id, (x->>'cantidad')::numeric as cantidad
              from jsonb_array_elements(p_items) x
  loop
    select * into s from public.herr_entregas where id = it.salida_id for update;
    if not found then
      raise exception 'SALIDA_NO_EXISTE' using errcode = 'P0001', detail = it.salida_id::text;
    end if;
    -- Solo confirmadas: primero se decide si es herramienta, después si volvió.
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
      fecha, sentido, origen, estado, salida_id, herramienta_id, nota,
      resuelto_por, resuelto_el, created_by, updated_by
    ) values (
      null, s.solicitud_id, s.obra_cod, s.descripcion, s.descripcion_norm, v_cant, s.unidad, s.material_id,
      p_fecha, 'devolucion', 'manual', 'confirmada', s.id, s.herramienta_id, nullif(p_nota, ''),
      p_user_id, now(), p_user_id, p_user_id
    ) returning * into v_nueva;

    return next v_nueva;
  end loop;
  return;
end;
$$;

-- "En obra" = confirmadas con algo sin devolver. Las sin revisar se cuentan aparte.
drop view if exists public.v_herr_entregas_obras;
create view public.v_herr_entregas_obras
with (security_invoker = true) as
select e.obra_cod                                                     as cod,
       count(*)                                                       as n,
       count(*) filter (where e.estado = 'pendiente')                 as n_pendientes,
       count(*) filter (where e.sentido = 'salida' and e.estado = 'confirmada' and e.en_obra > 0) as n_en_obra,
       coalesce(sum(e.en_obra) filter (where e.sentido = 'salida' and e.estado = 'confirmada'), 0) as cant_en_obra,
       count(*) filter (where e.sentido = 'devolucion' and e.estado <> 'anulada') as n_devoluciones,
       max(e.fecha)                                                   as ultima
  from public.herr_entregas e
 where e.obra_cod is not null
   and e.estado <> 'anulada'
 group by e.obra_cod;

comment on view public.v_herr_entregas_obras is
  'Obras con movimientos del pañol, agregadas en el server: salidas, sin revisar, en obra (confirmadas sin devolver) y devoluciones.';
