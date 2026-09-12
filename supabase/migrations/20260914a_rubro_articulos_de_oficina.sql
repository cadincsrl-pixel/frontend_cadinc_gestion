-- Rubro "Artículos de oficina" y la resma se muda ahí
-- ===================================================
-- 2026-09-12
--
-- Pregunta del user al corregir la resma de Cristian: "seria como articulos de
-- oficina?". Si.
--
-- La resma estaba en "Ferreteria general" porque el alta rapida desde el pedido
-- la dejo en el catch-all. Buscando toner, cartucho, birome, carpeta,
-- abrochadora, marcador, talonario y una docena mas de terminos, la resma
-- resulta ser el UNICO articulo de oficina del catalogo: de 2.485 fichas
-- activas, todo lo demas que matcheaba eran items de obra que comparten
-- palabras (cartucho de silicona, curva de sobrepaso, cinta de papel para
-- juntas, clips de espaciador).
--
-- POR QUE IGUAL SE CREA EL RUBRO CON UNA SOLA FICHA: el rubro no es solo una
-- etiqueta, es lo que el buscador del pedido usa para AGRUPAR (§5.15: el rubro
-- va en `group` del Combobox, nunca en `sub`). Papel de impresora dentro de
-- "Ferreteria general" queda enterrado entre 400 fichas de obra, y el que
-- necesita una resma no piensa "ferreteria". Y si la oficina empieza a pedir
-- por el sistema —que es lo que acaba de pasar con Cristian— el rubro ya esta.
--
-- Es barato y reversible: los rubros se leen de /api/stock/rubros y no hay
-- ninguna lista hardcodeada en el frontend, asi que esto no necesita deploy.
-- El id se toma del maximo + 1 en vez de hardcodearlo: la serie tiene huecos
-- (va 1-16 y salta a 25).

insert into stock_rubros (id, nombre)
values ((select max(id) + 1 from stock_rubros), 'Artículos de oficina');

update stock_materiales
   set rubro_id = (select id from stock_rubros where nombre = 'Artículos de oficina'),
       updated_at = now()
 where id = 2689;

do $$
declare v_rubro integer; v_n integer;
begin
  select id into v_rubro from stock_rubros where nombre = 'Artículos de oficina';
  if v_rubro is null then raise exception 'No se creo el rubro'; end if;

  select count(*) into v_n from stock_materiales where rubro_id = v_rubro;
  if v_n <> 1 then raise exception 'Esperaba 1 ficha en el rubro nuevo, hay %', v_n; end if;
end $$;
