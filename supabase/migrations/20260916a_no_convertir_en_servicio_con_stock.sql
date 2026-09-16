-- Una ficha con stock no puede volverse servicio
--
-- El user preguntó dónde se marca un artículo como servicio. Hasta hoy sólo se
-- podía al CREARLO —el tilde del alta rápida del pedido—, así que una ficha
-- vieja mal clasificada no tenía arreglo desde la pantalla. Se le agrega el
-- botón "🧾 Es servicio" en el catálogo, y ESTA GUARDA es la condición para que
-- eso sea seguro.
--
-- El riesgo es concreto: un servicio no tiene existencias, y desde 20260915j
-- `fn_stock_sin_servicios` bloquea CUALQUIER movimiento de stock de una ficha de
-- servicio. Si se convirtiera una ficha que tiene saldo o movimientos, ese stock
-- quedaría huérfano: no se podría despachar, ni devolver, ni ajustar. Sin salida.
--
-- Por eso revienta acá, antes, y con un mensaje que dice qué hacer: si hay stock
-- real hay que darle salida o ajustarlo a cero; si la ficha está de más, darla de
-- baja y crear el servicio aparte.
--
-- Probado con arnés de rollback:
--   ficha 164 (Planchuela 1-1/2, sin movimientos)  -> convierte OK
--   ficha 167 (Disco corte 115mm, stock 424)       -> rebota con
--                                                     TIENE_STOCK_NO_PUEDE_SER_SERVICIO

create or replace function public.fn_servicio_sin_stock_previo()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_movs integer;
begin
  if new.clase is distinct from 'servicio' then return new; end if;
  if old.clase is not distinct from 'servicio' then return new; end if;

  select count(*) into v_movs from public.stock_movimientos where material_id = new.id;
  if v_movs > 0 or coalesce(new.stock_actual, 0) <> 0 then
    raise exception 'TIENE_STOCK_NO_PUEDE_SER_SERVICIO'
      using errcode = 'P0001',
            detail  = format('La ficha %s tiene %s movimientos de stock y saldo %s. Un servicio no tiene existencias: si hay stock real hay que darle salida o ajustarlo a cero antes; si la ficha esta de mas, darla de baja y crear el servicio aparte.',
                             new.id, v_movs, coalesce(new.stock_actual, 0));
  end if;
  return new;
end $function$;

comment on function public.fn_servicio_sin_stock_previo() is
  'Impide convertir en servicio una ficha que tiene movimientos de stock o saldo distinto de cero: ese stock quedaria huerfano, porque fn_stock_sin_servicios bloquea todo movimiento posterior.';

drop trigger if exists trg_servicio_sin_stock_previo on public.stock_materiales;
create trigger trg_servicio_sin_stock_previo
  before update of clase on public.stock_materiales
  for each row execute function fn_servicio_sin_stock_previo();
