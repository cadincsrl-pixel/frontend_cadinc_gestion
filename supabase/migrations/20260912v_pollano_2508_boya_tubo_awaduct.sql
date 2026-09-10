-- LAMADRID (CC-016), pedido 694 — las tres correcciones que marcó el user
-- sobre la boleta POLLANO del 25/08:
--
--   1. El renglón 2 ilegible es "boya de telgopor 3/4" ($3.260).
--   2. Los renglones 7 y 8 dicen TUBO, no tuerca.
--   3. Del renglón 10 para abajo, todo es Awaduct.
--
-- Sobre el punto 2 no hay nada que hacer: en el catálogo "tubo" y "rosca" son
-- la misma pieza. Las fichas 206 y 208 ("Rosca macho/hembra termofusión 3/4")
-- ya traen los alias "tubo macho 25x3/4" y "tubo hembra 25x3/4" con el código
-- de lista 08272025020 / 08271025020. El enganche que hizo Nicolás era
-- correcto; lo que estaba mal era mi lectura del papel.
--
-- Sobre el punto 3, de los siete renglones (10 a 16) seis YA apuntaban a la
-- línea Awaduct, que se reconoce por el código de lista en el primer alias:
--   10 Caños 32x3m    → ficha 2355, cód. 1060  ✓
--   11 Curvas 32x45°  → ficha 2276, cód. 2252  ✓
--   12 Codos 32x90°   → ficha  184, SIN código ✗  ← el único fuera de línea
--   13 Buje 50x40     → ficha  196, cód. 2028  ✓
--   14 Buje 40x32     → ficha  741, cód. 2256  ✓
--   15 Manguito 32    → ficha 2187, cód. 2267  ✓
--   16 Ramal Y 32     → ficha 1931, cód. 2272  ✓

begin;

-- ── 1) Boya de telgopor: ficha nueva + el renglón que faltaba ───────────
-- No existía en el catálogo (la única coincidencia con "telgopor" era el
-- ladrillo para losa). Va en Sanitaria, al lado del flotante del renglón 1.
insert into stock_materiales (rubro_id, nombre, unidad, precio_ref, precio_actualizado_en, clase, alias, obs)
values (1, 'Boya de telgopor 3/4"', 'unid', 3260, '2026-08-25', 'material',
        array['boya de telgopor', 'boya telgopor 3/4', 'boya para flotante', 'boya de tanque'],
        'Creada del renglón 2 de la boleta POLLANO del 25/08 (LAMADRID).');

with nuevo as (
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, proveedor_id, precio_unit,
     fecha_resolucion, fecha_envio, material_id, pagado_por, cantidad_comprada, cantidad_enviada, obs)
  select 694, 'Boya de telgopor 3/4"', 1, 'unid', 'enviado', 1, 3260,
         '2026-08-25', '2026-08-25', m.id, 'cadinc', 1, 1,
         'Boleta POLLANO 25/08: "boya de telgopor 3/4"'
    from stock_materiales m where m.nombre = 'Boya de telgopor 3/4"'
  returning id, descripcion, cantidad, unidad, precio_unit, fecha_resolucion, proveedor_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad, precio_unit, precio_total,
   origen, proveedor_id, fecha_resolucion, pagado_por, a_cargo_de, created_by)
select 'CC-016', 694, n.id, n.descripcion, n.cantidad, n.unidad, n.precio_unit,
       n.cantidad * n.precio_unit, 'proveedor', n.proveedor_id, n.fecha_resolucion,
       'cadinc', 'cliente', '2e45e785-fa26-4e1a-8602-22fa093c39d8'
  from nuevo n;

-- ── 2) Renglón 12 a la línea Awaduct ───────────────────────────────────
-- De la ficha genérica 184 ("Codo PVC 32mm", sin código de lista) a la 2279,
-- cód. 2265. Igual que pasó con los de 63mm: en el papel dice 90° y en la
-- línea de desagüe ese codo es de 87°30'.
update solicitud_compra_item
   set material_id = 2279, descripcion = 'Codo PVC 32mm 87°30'' HH'
 where id = 3497;

update materiales_a_cuenta_cliente
   set descripcion = 'Codo PVC 32mm 87°30'' HH'
 where item_id = 3497;

-- La ficha nunca había tenido precio; la boleta le da uno real.
update stock_materiales
   set precio_ref = 840, precio_actualizado_en = '2026-08-25'
 where id = 2279 and precio_ref = 0;

-- ── 3) Alias para que el buscador encuentre la línea la próxima ─────────
-- Frases completas, nunca "awaduct" suelto: el matcher es substring.
update stock_materiales set alias = alias || array['codo 32 a 90 awaduct']  where id = 2279;
update stock_materiales set alias = alias || array['codo 32 a 45 awaduct']  where id = 2276;
update stock_materiales set alias = alias || array['manguito 32 awaduct']   where id = 2187;
update stock_materiales set alias = alias || array['ramal y 32 awaduct']    where id = 1931;

commit;
