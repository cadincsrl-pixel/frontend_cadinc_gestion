-- Áridos: un viaje cobrado no cambia de cliente ni de importe (2026-09-24).
--
-- El 24/09 Alina pasó el viaje #57 (08/09, El Portillo lote 34) de Brignoli a
-- Estudio Watch. Estaba adentro del cobro #14 de Brignoli, y nada lo frenó: el
-- viaje quedó a nombre de Watch pero pagado con plata de Brignoli, y en las dos
-- cuentas el saldo dejó de coincidir con la lista de pendientes. Se arregló a
-- mano (el viaje salió del cobro: lo debe Watch).
--
-- Reglas, en la base para que ningún camino las saltee:
--   1. Un viaje con cobro no cambia cliente, importe ni tipo, y no se borra:
--      VENTA_COBRADA. Primero se saca del cobro (cobro_id = null).
--   2. Imputar un viaje a un cobro (cobro_id nuevo) exige que sea una venta del
--      MISMO cliente (COBRO_DE_OTRO_CLIENTE) y que lo imputado no pase el monto
--      del cobro (COBRO_SIN_SALDO).
--   3. Un cobro no baja su monto por debajo de lo imputado
--      (COBRO_MENOR_A_IMPUTADO) ni cambia de cliente con viajes adentro
--      (COBRO_CON_VIAJES).
-- Borrar un cobro sigue soltando sus viajes (FK on delete set null): vuelven a
-- pendientes, que es lo que se espera.
--
-- Y la RPC que faltaba: imputar_cobro_arido aplica la plata a favor de un cobro
-- a viajes pendientes del mismo cliente. Hasta hoy solo se imputaba al crear el
-- cobro, así que un saldo a favor no se podía usar.

create or replace function public._aridos_mov_cobrado_chk()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cobro   public.aridos_cobros%rowtype;
  v_imput   numeric;
begin
  if tg_op = 'DELETE' then
    if old.cobro_id is not null then
      raise exception 'VENTA_COBRADA: el viaje #% está en el cobro #%; sacalo del cobro antes de borrarlo', old.id, old.cobro_id
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- 1. Sigue en el mismo cobro: no se tocan los datos que el cobro usó.
  if old.cobro_id is not null and new.cobro_id is not distinct from old.cobro_id
     and (new.cliente_id is distinct from old.cliente_id
          or coalesce(new.importe, 0) <> coalesce(old.importe, 0)
          or new.tipo is distinct from old.tipo) then
    raise exception 'VENTA_COBRADA: el viaje #% está en el cobro #%; sacalo del cobro antes de cambiar el cliente o el importe', old.id, old.cobro_id
      using errcode = 'P0001';
  end if;

  -- 2. Entra a un cobro (nuevo o distinto).
  if new.cobro_id is not null and new.cobro_id is distinct from old.cobro_id then
    select * into v_cobro from public.aridos_cobros where id = new.cobro_id for update;
    if new.tipo <> 'venta' or new.cliente_id is distinct from v_cobro.cliente_id then
      raise exception 'COBRO_DE_OTRO_CLIENTE: el viaje #% no es una venta del cliente del cobro #%', new.id, new.cobro_id
        using errcode = 'P0001';
    end if;
    select coalesce(sum(coalesce(importe, 0)), 0) into v_imput
      from public.aridos_movimientos
     where cobro_id = new.cobro_id and id <> new.id;
    if v_imput + coalesce(new.importe, 0) > v_cobro.monto + 0.005 then
      raise exception 'COBRO_SIN_SALDO: al cobro #% le quedan % y el viaje #% es de %',
        new.cobro_id, v_cobro.monto - v_imput, new.id, coalesce(new.importe, 0)
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aridos_mov_cobrado on public.aridos_movimientos;
create trigger trg_aridos_mov_cobrado
  before update or delete on public.aridos_movimientos
  for each row execute function public._aridos_mov_cobrado_chk();

create or replace function public._aridos_cobro_chk()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_imput numeric;
begin
  if new.cliente_id is distinct from old.cliente_id
     and exists (select 1 from public.aridos_movimientos where cobro_id = old.id) then
    raise exception 'COBRO_CON_VIAJES: el cobro #% tiene viajes imputados; no puede cambiar de cliente', old.id
      using errcode = 'P0001';
  end if;
  if new.monto < old.monto then
    select coalesce(sum(coalesce(importe, 0)), 0) into v_imput
      from public.aridos_movimientos where cobro_id = old.id;
    if new.monto + 0.005 < v_imput then
      raise exception 'COBRO_MENOR_A_IMPUTADO: el cobro #% tiene % imputados a viajes', old.id, v_imput
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aridos_cobro_chk on public.aridos_cobros;
create trigger trg_aridos_cobro_chk
  before update on public.aridos_cobros
  for each row execute function public._aridos_cobro_chk();

-- Aplica la plata a favor de un cobro a viajes pendientes del mismo cliente.
-- El trigger valida cliente y saldo; acá se exige que TODOS los viajes pedidos
-- se imputen (si alguno ya estaba cobrado o no existe, no se imputa ninguno).
create or replace function public.imputar_cobro_arido(p_cobro_id integer, p_venta_ids integer[], p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobro public.aridos_cobros%rowtype;
  v_n     integer;
begin
  select * into v_cobro from public.aridos_cobros where id = p_cobro_id for update;
  if not found then
    raise exception 'COBRO_NO_EXISTE' using errcode = 'P0001';
  end if;
  if p_venta_ids is null or coalesce(array_length(p_venta_ids, 1), 0) = 0 then
    raise exception 'SIN_VIAJES' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('aridos_cobro_' || v_cobro.cliente_id::text));

  update public.aridos_movimientos
     set cobro_id = p_cobro_id, updated_by = p_user_id, updated_at = now()
   where id = any(p_venta_ids)
     and cobro_id is null;
  get diagnostics v_n = row_count;

  if v_n <> (select count(distinct x) from unnest(p_venta_ids) x) then
    raise exception 'VIAJE_NO_IMPUTABLE: alguno de los viajes no existe o ya está en otro cobro'
      using errcode = 'P0001';
  end if;
  return v_n;
end;
$$;

revoke all on function public.imputar_cobro_arido(integer, integer[], uuid) from public, anon, authenticated;
grant execute on function public.imputar_cobro_arido(integer, integer[], uuid) to service_role;
