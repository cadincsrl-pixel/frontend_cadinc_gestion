-- =====================================================================
-- 20261005f — La ficha manda sobre la clase del renglón, y 9 fichas pasan
-- a herramienta (2026-09-26, revisión del circuito Pedidos y Stock, A3)
--
-- La clase decide si un renglón se cobra y si mueve stock, y el renglón y
-- su ficha podían decir cosas distintas: 26 renglones «herramienta» con
-- ficha de material o EPP descontaban stock y no se cobraban.
--
-- Decisión del dueño (26/09):
--   · Son herramientas y la ficha estaba mal: nivel óptico (2732), dobladora
--     (2844), prolongación 5 m (280) y 50 m (2766), zapatilla 25 m (2765),
--     grupo electrógeno (2779), escaleras (1550, 1557) y piola de vida (2783).
--   · Son consumibles y quedan como material: fratacho (339, «sí se cobra»),
--     balde (340), tanza (774), punta de demoledor (820). «A veces se cobran,
--     depende el tipo de obra»: cuando no, «marcar consumible propio» en la
--     cuenta corriente. El candado (146) no se tocó.
--   · Casco (643) y chaleco (658) siguen EPP.
--
-- 1. Reclasificar las 9 fichas. trg_material_clase_saca_de_mcc (20260915a)
--    saca de la cuenta del cliente lo no congelado: una escalera de madera
--    por $60.000 (sin cobro ni certificado).
-- 2. Tocar material_id de sus renglones para que el pañol los tome (§5.12).
-- 3. Desde ahora la clase del renglón se alinea con la ficha al cargarla o
--    cambiarla: ficha herramienta → renglón herramienta; renglón herramienta
--    con ficha material/epp/servicio → material (y sin «devuelve»). El
--    renglón «material» con ficha EPP queda así: el pedido no tiene clase
--    EPP, la define la ficha.
-- Los 8 renglones viejos de consumibles cargados como herramienta (balde,
-- tanza, punta, fratacho, candado) no se tocan: ya salieron y son poca plata.
-- =====================================================================

-- 1 y 2.
do $m$
declare
  v_ids int[] := array[2732, 2844, 280, 2766, 2765, 2779, 1550, 1557, 2783];
begin
  update public.stock_materiales set clase = 'herramienta' where id = any(v_ids) and clase <> 'herramienta';
  update public.solicitud_compra_item set material_id = material_id where material_id = any(v_ids);
end $m$;

-- 3.
create or replace function public.fn_item_alinea_clase_con_ficha()
 returns trigger
 language plpgsql
 set search_path = public, pg_temp
as $$
declare
  v_clase text;
begin
  if new.material_id is null then
    return new;
  end if;
  select clase into v_clase from stock_materiales where id = new.material_id;
  if v_clase = 'herramienta' then
    new.clase := 'herramienta';
  elsif v_clase is not null and coalesce(new.clase, 'material') = 'herramienta' then
    new.clase    := 'material';
    new.devuelve := false;
  end if;
  return new;
end $$;

-- Nombre elegido para correr ANTES de trg_item_cache_herr_origen (orden
-- alfabético de los BEFORE), que cachea el origen del pañol con la clase.
drop trigger if exists trg_item_alinea_clase_con_ficha on public.solicitud_compra_item;
create trigger trg_item_alinea_clase_con_ficha
  before insert or update of material_id, clase on public.solicitud_compra_item
  for each row
  execute function public.fn_item_alinea_clase_con_ficha();
