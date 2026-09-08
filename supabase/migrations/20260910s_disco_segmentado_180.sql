-- Catálogo: el disco diamantado segmentado también existe en 180mm
--
-- El user (08/09, siguiendo la reorganización de discos de 20260910r):
-- "Disco Diamantado Segmentado Patroll 180mm también tenemos este".
-- Misma familia que el segmentado de 115: amarillo Patroll, para hormigón,
-- en la medida de la amoladora grande (7"). Nace en $0: toma precio con la
-- primera compra.
--
-- Ojo con las fichas 180 que ya existen y NO se tocan: 861 "Disco diamantado
-- 180mm" (genérico, con los alias "widia de 7") y 1562 "Disco widia 180mm"
-- — si alguna resultara ser este mismo segmentado, se fusionan a mano después.

insert into stock_materiales (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo, precio_ref, alias, activo, obs) values
  (7, 'Disco diamantado segmentado 180mm (Patroll amarillo)', 'unid', 'material', 0, 0, 0,
   array['disco segmentado 180','disco segmentado 7','disco segmentado de 7',
         'disco diamantado segmentado 7','disco para hormigon 7','disco para hormigon 180'],
   true, 'Amarillo Patroll, 7". Para cortar HORMIGÓN. Alta 08/09/2026 (dicho del user); precio con la primera compra.');
