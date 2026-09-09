-- 20260912f — La cuenta corriente sabe el precio de referencia de la ficha (fase 3 de precios).
--
-- Para la columna "Sugerido" y el botón "Usar sugeridos (N)" del modal Cargar precios: cada
-- renglón trae el precio de referencia de su ficha, la unidad de la ficha y si la unidad del
-- renglón es compatible (`unidad_compatible`, la única regla). Un renglón en $0 con ficha con
-- precio y unidad compatible se puede tasar con un click; uno con unidad distinta primero se
-- pasa a la unidad de la ficha. Columnas nuevas al final (CREATE OR REPLACE VIEW).

create or replace view public.v_cuenta_corriente with (security_invoker = on) as
 SELECT c.id,
    c.obra_cod,
    COALESCE(o.nom, c.obra_cod) AS obra_nom,
    COALESCE(o.archivada, false) AS obra_archivada,
    COALESCE(o.materiales_a_cargo_de, 'cliente'::text) AS obra_modalidad,
    c.solicitud_id,
    c.item_id,
    c.descripcion,
    c.cantidad,
    c.unidad,
    c.precio_unit,
    c.precio_total,
    c.origen,
    c.proveedor_id,
    p.nombre AS proveedor_nom,
    c.factura_id,
    f.numero AS factura_numero,
    f.adjunto_url AS factura_adjunto_url,
    f.fecha AS factura_fecha,
    c.fecha_resolucion,
    to_char(c.fecha_resolucion::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    c.pagado_por,
    c.a_cargo_de,
    c.cobro_id,
    c.monto_cobrado,
    i.estado AS item_estado,
    i.material_id,
    m.clase,
    m.rubro_id,
    r.nombre AS rubro_nom,
        CASE
            WHEN m.clase = 'epp'::text THEN 'epp'::text
            ELSE 'material'::text
        END AS tipo,
        CASE
            WHEN c.pagado_por = 'cliente'::text THEN 'pago_directo'::text
            WHEN c.a_cargo_de = 'cadinc'::text THEN 'gasto_cadinc'::text
            WHEN c.cobro_id IS NOT NULL THEN 'cobrado'::text
            ELSE 'a_cobrar'::text
        END AS estado,
        CASE
            WHEN c.a_cargo_de = 'cadinc'::text THEN
            CASE
                WHEN m.clase = 'epp'::text THEN 'epp'::text
                ELSE 'llave_en_mano'::text
            END
            ELSE NULL::text
        END AS motivo_cadinc,
    norm_txt((((((((((c.descripcion || ' '::text) || COALESCE(p.nombre, ''::text)) || ' '::text) || COALESCE(o.nom, ''::text)) || ' '::text) || c.obra_cod) || ' '::text) || c.solicitud_id::text) || ' '::text) || COALESCE(f.numero, ''::text)) AS busq,
    c.created_at,
    c.updated_at,
    COALESCE(o.es_interna, false) AS obra_interna,
    c.certificado_id,
    cc.numero AS certificado_numero,
    i.esperando_precio,
    m.precio_ref AS ficha_precio_ref,
    m.unidad AS ficha_unidad,
    CASE WHEN m.id IS NULL THEN NULL::boolean ELSE public.unidad_compatible(c.unidad, m.unidad) END AS ficha_unidad_ok
   FROM materiales_a_cuenta_cliente c
     JOIN solicitud_compra_item i ON i.id = c.item_id
     LEFT JOIN obras o ON o.cod = c.obra_cod
     LEFT JOIN stock_materiales m ON m.id = i.material_id
     LEFT JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = c.factura_id
     LEFT JOIN certificados_cliente cc ON cc.id = c.certificado_id;
