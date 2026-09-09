-- 20260912h — El aviso de "sin precio" trae el nombre de la obra y cuántos esperan precio
-- (fase 3 de precios: la campana lo muestra por obra sin tener que bajar la lista de obras).

create or replace view public.v_cuenta_cliente_pendientes as
 SELECT m.obra_cod,
    count(*)::integer AS sin_precio,
    COALESCE(o.archivada, false) AS obra_archivada,
    COALESCE(o.nom, m.obra_cod) AS obra_nom,
    (count(*) FILTER (WHERE i.esperando_precio))::integer AS esperando
   FROM materiales_a_cuenta_cliente m
     JOIN solicitud_compra_item i ON i.id = m.item_id
     LEFT JOIN obras o ON o.cod = m.obra_cod
  WHERE m.precio_unit = 0::numeric AND NOT COALESCE(o.es_interna, false) AND COALESCE(m.pagado_por, 'cadinc'::text) <> 'cliente'::text
  GROUP BY m.obra_cod, (COALESCE(o.archivada, false)), (COALESCE(o.nom, m.obra_cod));
