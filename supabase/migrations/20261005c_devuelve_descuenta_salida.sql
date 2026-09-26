-- =====================================================================
-- 20261005c — El renglón «↩ Devuelve» descuenta las salidas del pañol
-- (2026-09-26, revisión del circuito Pedidos y Stock, hallazgo C8)
--
-- Un pedido con un renglón de herramienta «↩ Devuelve» genera, al recibirse,
-- una fila `sentido='devolucion'` en herr_entregas SIN `salida_id`
-- (fn_herr_entregas_sync). Como lo que está en obra se cuenta por salida
-- (`devuelto`), esa devolución no descontaba nada: la herramienta seguía
-- «en obra» y el pañolero tenía que cargar el retorno de nuevo.
-- Al 26/09 nadie usó todavía «↩ Devuelve» (0 renglones): se arregla antes.
--
-- Regla: antes de insertar una devolución que viene de un renglón (item_id)
-- y no dice de qué salida es, se reparte FIFO entre las salidas vivas
-- (confirmadas, con algo en obra) de la MISMA obra y la misma herramienta
-- (material_id; sin ficha, la descripción normalizada). La primera parte
-- queda en la fila original; el resto, en filas hermanas con el mismo
-- item_id (así la suma por renglón de fn_herr_entregas_sync no cambia).
-- Lo que no encuentra salida queda sin salida_id y en `revisar`.
-- =====================================================================

create or replace function public.fn_herr_devolucion_fifo()
 returns trigger
 language plpgsql
 set search_path = public, pg_temp
as $$
declare
  v_resto numeric := new.cantidad;
  v_primera boolean := true;
  v_cap numeric;
  s record;
begin
  for s in
    select id, cantidad - devuelto as en_obra
      from herr_entregas
     where sentido = 'salida'
       and estado = 'confirmada'
       and obra_cod = new.obra_cod
       and cantidad - devuelto > 0
       and (case when new.material_id is not null then material_id = new.material_id
                 else material_id is null and descripcion_norm = new.descripcion_norm end)
     order by fecha, id
     for update
  loop
    exit when v_resto <= 0;
    v_cap := least(v_resto, s.en_obra);
    if v_primera then
      new.salida_id := s.id;
      new.cantidad  := v_cap;
      new.estado    := 'confirmada';
      v_primera := false;
    else
      insert into herr_entregas (
        item_id, solicitud_id, obra_cod, descripcion, descripcion_norm, cantidad, unidad, material_id,
        fecha, sentido, origen, estado, salida_id, remito_envio_id, remito_numero, nota, created_by, updated_by
      ) values (
        new.item_id, new.solicitud_id, new.obra_cod, new.descripcion, new.descripcion_norm, v_cap, new.unidad, new.material_id,
        new.fecha, 'devolucion', new.origen, 'confirmada', s.id, new.remito_envio_id, new.remito_numero,
        'Parte de la devolución del renglón #' || new.item_id, new.created_by, new.updated_by
      );
    end if;
    v_resto := v_resto - v_cap;
  end loop;

  if v_resto > 0 then
    if v_primera then
      -- No hay ninguna salida en obra para descontar: queda a revisar.
      new.estado := 'revisar';
      new.nota   := coalesce(new.nota || ' | ', '') || 'Devuelve sin salida en obra para descontar';
    else
      insert into herr_entregas (
        item_id, solicitud_id, obra_cod, descripcion, descripcion_norm, cantidad, unidad, material_id,
        fecha, sentido, origen, estado, remito_envio_id, remito_numero, nota, created_by, updated_by
      ) values (
        new.item_id, new.solicitud_id, new.obra_cod, new.descripcion, new.descripcion_norm, v_resto, new.unidad, new.material_id,
        new.fecha, 'devolucion', new.origen, 'revisar', new.remito_envio_id, new.remito_numero,
        'Devuelve más de lo que figura en obra (renglón #' || new.item_id || ')', new.created_by, new.updated_by
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_herr_devolucion_fifo on public.herr_entregas;
create trigger trg_herr_devolucion_fifo
  before insert on public.herr_entregas
  for each row
  -- Sin `revisar`: la fila del sobrante la inserta esta misma función y no
  -- tiene que volver a repartirse (la primera prueba la descontaba dos veces).
  when (new.sentido = 'devolucion' and new.salida_id is null and new.item_id is not null
        and new.estado is distinct from 'revisar')
  execute function public.fn_herr_devolucion_fifo();
