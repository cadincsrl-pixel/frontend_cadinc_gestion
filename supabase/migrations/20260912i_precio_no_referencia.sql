-- Descartar una compra como referencia de precio
-- (Renombrada de 20260912a el 09/09: ese prefijo ya lo usaba
--  20260912a_precios_de_internet_tanda_1.sql, de otra sesión.)
--
-- El catálogo marca un material "desactualizado" comparando su precio de
-- referencia contra la ÚLTIMA compra. Cuando esa última compra tiene el precio
-- mal —otra pieza vinculada a la ficha equivocada, una urgencia carísima, un
-- renglón que en realidad era un combo— el material queda marcado para
-- siempre: se puede corregir el precio de referencia a mano, pero la compra
-- mala sigue siendo la última y la diferencia vuelve a aparecer.
--
-- Caso que motivó esto (el user, 09/09): "Te termofusión 25mm" figura +438%
-- desactualizada. En la MISMA factura del Fontanero (14/07, CASA OPERARIOS)
-- hay dos renglones con esa ficha: 12 unidades a $966,85 —el precio real— y 2
-- unidades a $5.202,13, que es 5,4 veces más y evidentemente es otra pieza.
--
-- La marca va en el RENGLÓN, no en el material: lo que está mal es ese dato
-- puntual, y el resto del historial del material sigue sirviendo. Es
-- reversible y no toca el precio cobrado: el renglón sigue valuado igual en la
-- cuenta de la obra (si además el precio cobrado está mal, eso se corrige por
-- separado, que es otra decisión).

alter table public.solicitud_compra_item
  add column if not exists precio_no_referencia boolean not null default false;

comment on column public.solicitud_compra_item.precio_no_referencia is
  'Este precio NO sirve como referencia del catálogo (mal cargado, atípico o '
  'de otra pieza). Lo excluye de v_material_ultima_compra y v_material_compras. '
  'No cambia lo que se le cobró a la obra.';

-- Las dos vistas del catálogo ignoran los renglones descartados. Se repiten
-- tal cual estaban (20260906f / 20260911d) más la condición nueva.

create or replace view public.v_material_ultima_compra as
 SELECT DISTINCT ON (i.material_id) i.material_id,
    i.id AS item_id,
    i.solicitud_id,
    s.obra_cod,
    i.precio_unit,
    i.proveedor_id,
    p.nombre AS proveedor_nombre,
    i.fecha_resolucion AS fecha,
    i.pagado_por,
    i.unidad
   FROM solicitud_compra_item i
     JOIN solicitud_compra s ON s.id = i.solicitud_id
     LEFT JOIN proveedores p ON p.id = i.proveedor_id
  WHERE i.material_id IS NOT NULL AND i.precio_unit > 0::numeric
    AND NOT i.precio_no_referencia
    AND (i.estado = ANY (ARRAY['comprado'::text, 'en_proveedor'::text, 'retirado'::text, 'enviado'::text]))
    AND (i.proveedor_id IS NOT NULL OR (EXISTS ( SELECT 1
           FROM solicitud_item_eventos e
          WHERE e.item_id = i.id AND (e.accion = ANY (ARRAY['comprado'::text, 'en_proveedor'::text])))) OR (EXISTS ( SELECT 1
           FROM materiales_a_cuenta_cliente c
          WHERE c.item_id = i.id AND c.origen = 'proveedor'::text)))
  ORDER BY i.material_id, i.fecha_resolucion DESC NULLS LAST, i.id DESC;

-- En el historial el renglón descartado SÍ se sigue viendo (con su marca), así
-- que la vista expone la columna en vez de filtrarla: el user tiene que poder
-- ver qué descartó y volver atrás.
create or replace view public.v_material_compras as
 SELECT i.material_id,
    i.id AS item_id,
    i.solicitud_id,
    s.obra_cod,
    o.nom AS obra_nom,
    i.descripcion,
    i.color,
    COALESCE(i.cantidad_comprada, i.cantidad) AS cantidad,
    i.unidad,
    i.precio_unit,
    i.proveedor_id,
    p.nombre AS proveedor_nombre,
    i.fecha_resolucion AS fecha,
    i.pagado_por,
    i.factura_id,
    f.numero AS factura_numero,
    i.estado,
    i.precio_no_referencia
   FROM solicitud_compra_item i
     JOIN solicitud_compra s ON s.id = i.solicitud_id
     LEFT JOIN obras o ON o.cod = s.obra_cod
     LEFT JOIN proveedores p ON p.id = i.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = i.factura_id
  WHERE i.material_id IS NOT NULL AND i.precio_unit > 0::numeric
    AND (i.estado = ANY (ARRAY['comprado'::text, 'en_proveedor'::text, 'retirado'::text, 'enviado'::text]))
    AND (i.proveedor_id IS NOT NULL OR (EXISTS ( SELECT 1
           FROM solicitud_item_eventos e
          WHERE e.item_id = i.id AND (e.accion = ANY (ARRAY['comprado'::text, 'en_proveedor'::text])))) OR (EXISTS ( SELECT 1
           FROM materiales_a_cuenta_cliente c
          WHERE c.item_id = i.id AND c.origen = 'proveedor'::text)));

-- El caso que lo motivó, ya aplicado: el renglón 941 (2 unidades a $5.202,13,
-- CASA OPERARIOS 14/07) queda fuera de la referencia. La ficha vuelve a tomar
-- la compra buena del mismo día ($966,85 x12) y pasa de "+438% desactualizada"
-- a "al día".
--
-- OJO: el renglón sigue valuado a $5.202,13 en la cuenta de CASA OPERARIOS
-- (es gasto CADINC, llave en mano). Si con la factura del Fontanero a la vista
-- resulta que también ahí está mal, se corrige aparte.

update solicitud_compra_item set precio_no_referencia = true where id = 941;
