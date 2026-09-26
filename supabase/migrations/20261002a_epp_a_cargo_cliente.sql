-- =====================================================================
-- 20261002a — EPP que se le cobra al cliente (2026-09-26)
--
-- Pedido del dueño: en Cuenta corriente › «Cargar precios» poder elegir, en
-- un renglón de EPP, que lo pague el cliente. Hasta hoy un EPP era SIEMPRE
-- gasto de CADINC (`calc_a_cargo_de`, 20260904ak), sin excepción.
--
-- Decisiones (26/09):
--   · Por renglón, en Cargar precios. El default sigue siendo CADINC.
--   · Vale en obras de cliente y por administración. En una llave en mano
--     todo es de CADINC: se rechaza (OBRA_LLAVE_EN_MANO).
--   · Un renglón cobrado o certificado no se toca (MCC_COBRADO /
--     MCC_CERTIFICADO), igual que el consumible propio.
--
-- Mecánica, calcada de `consumible_propio` (20260914aa):
--   1. solicitud_compra_item.epp_a_cargo_cliente (default false).
--   2. calc_a_cargo_de: el EPP va a CADINC salvo que tenga la marca; con la
--      marca sigue la regla de siempre (llave en mano → CADINC, por
--      administración → cliente, si no → cliente).
--   3. Los triggers del ítem (congelado + recálculo de a_cargo_de) también
--      miran la columna nueva.
--   4. RPC marcar_epp_a_cargo_cliente(obra, items, marcar, user): única
--      puerta, con validaciones y evento en solicitud_item_eventos.
-- v_cuenta_corriente no cambia: con la marca el renglón queda
-- a_cargo_de='cliente' → estado a_cobrar, tipo 'epp', motivo_cadinc null.
-- =====================================================================

alter table public.solicitud_compra_item
  add column epp_a_cargo_cliente boolean not null default false;

comment on column public.solicitud_compra_item.epp_a_cargo_cliente is
  'EPP que se le cobra al cliente (excepción a «el EPP es gasto de CADINC»). Solo por marcar_epp_a_cargo_cliente. 20261002a.';

create or replace function public.calc_a_cargo_de(p_obra_cod text, p_item_id integer)
 returns text
 language sql
 stable
as $function$
  select case
           when (select m.clase from public.solicitud_compra_item i
                   left join public.stock_materiales m on m.id = i.material_id
                  where i.id = p_item_id) = 'herramienta' then 'cadinc'
           when (select m.clase from public.solicitud_compra_item i
                   left join public.stock_materiales m on m.id = i.material_id
                  where i.id = p_item_id) = 'epp'
                and not coalesce((select epp_a_cargo_cliente from public.solicitud_compra_item where id = p_item_id), false) then 'cadinc'
           when (select materiales_a_cargo_de from public.obras where cod = p_obra_cod) = 'cadinc' then 'cadinc'
           when (select por_administracion from public.obras where cod = p_obra_cod) then 'cliente'
           when (select consumible_propio from public.solicitud_compra_item where id = p_item_id) then 'cadinc'
           else 'cliente'
         end
$function$;

-- Congelado y recálculo: mismos triggers que el consumible, con la columna nueva.
drop trigger if exists trg_item_consumible_congelado on public.solicitud_compra_item;
create trigger trg_item_consumible_congelado
  before update of consumible_propio, epp_a_cargo_cliente on public.solicitud_compra_item
  for each row
  when (old.consumible_propio is distinct from new.consumible_propio
        or old.epp_a_cargo_cliente is distinct from new.epp_a_cargo_cliente)
  execute function public.fn_item_consumible_congelado();

drop trigger if exists trg_item_recalc_a_cargo_de on public.solicitud_compra_item;
create trigger trg_item_recalc_a_cargo_de
  after update of consumible_propio, material_id, epp_a_cargo_cliente on public.solicitud_compra_item
  for each row
  when (old.consumible_propio is distinct from new.consumible_propio
        or old.material_id is distinct from new.material_id
        or old.epp_a_cargo_cliente is distinct from new.epp_a_cargo_cliente)
  execute function public.fn_item_recalc_a_cargo_de();

create or replace function public.marcar_epp_a_cargo_cliente(
  p_obra_cod text,
  p_item_ids integer[],
  p_marcar   boolean,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_obra    obras%rowtype;
  v_n       integer := 0;
  v_plata   numeric := 0;
  v_pedidos integer := coalesce(array_length(p_item_ids, 1), 0);
  r         record;
begin
  if v_pedidos = 0 then
    raise exception 'SIN_ITEMS' using errcode = 'P0001';
  end if;

  select * into v_obra from obras where cod = p_obra_cod for update;
  if not found then
    raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001';
  end if;
  if coalesce(v_obra.materiales_a_cargo_de, 'cliente') = 'cadinc' then
    raise exception 'OBRA_LLAVE_EN_MANO' using errcode = 'P0001';
  end if;

  for r in
    select i.id, c.precio_total, c.cobro_id, c.certificado_id, m.clase
      from solicitud_compra_item i
      join materiales_a_cuenta_cliente c on c.item_id = i.id
      left join stock_materiales m on m.id = i.material_id
     where i.id = any(p_item_ids)
       and c.obra_cod = p_obra_cod
     order by i.id
     for no key update of i
  loop
    if r.cobro_id is not null then
      raise exception 'MCC_COBRADO' using errcode = 'P0001', detail = r.id::text;
    end if;
    if r.certificado_id is not null then
      raise exception 'MCC_CERTIFICADO' using errcode = 'P0001', detail = r.id::text;
    end if;
    if r.clase is distinct from 'epp' then
      raise exception 'ITEM_NO_ES_EPP' using errcode = 'P0001', detail = r.id::text;
    end if;
    v_n     := v_n + 1;
    v_plata := v_plata + coalesce(r.precio_total, 0);
  end loop;

  if v_n <> v_pedidos then
    raise exception 'ITEM_NO_ES_DE_LA_OBRA'
      using errcode = 'P0001',
            detail = format('pedidos=%s validos=%s', v_pedidos, v_n);
  end if;

  update solicitud_compra_item
     set epp_a_cargo_cliente = p_marcar,
         updated_by          = p_user_id
   where id = any(p_item_ids)
     and epp_a_cargo_cliente is distinct from p_marcar;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  select i.id, i.solicitud_id,
         case when p_marcar then 'epp_a_cargo_cliente' else 'epp_a_cargo_cadinc' end,
         i.estado, i.estado,
         i.cantidad,
         case when p_marcar then 'EPP que se le cobra al cliente' else 'EPP vuelve a ser gasto de CADINC' end,
         jsonb_build_object('obra_cod', p_obra_cod, 'precio_total', c.precio_total),
         p_user_id
    from solicitud_compra_item i
    join materiales_a_cuenta_cliente c on c.item_id = i.id
   where i.id = any(p_item_ids) and c.obra_cod = p_obra_cod;

  return jsonb_build_object('obra_cod', p_obra_cod, 'marcados', v_n, 'marcar', p_marcar, 'plata', round(v_plata, 2));
end $$;

comment on function public.marcar_epp_a_cargo_cliente(text, integer[], boolean, uuid) is
  'Marca/desmarca EPP que se le cobra al cliente (rechaza llave en mano, cobrados, certificados y lo que no es EPP). 20261002a.';

revoke all on function public.marcar_epp_a_cargo_cliente(text, integer[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.marcar_epp_a_cargo_cliente(text, integer[], boolean, uuid) to service_role;
