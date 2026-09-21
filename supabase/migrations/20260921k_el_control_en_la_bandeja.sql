-- =====================================================================
-- El resultado del control, en la bandeja (2026-09-21)
--
-- Pedido del dueño: "la alerta, si está todo ok y comprobado, me debería
-- aparecer en el menú principal también, con una tilde o algo".
--
-- Tenía razón: el control se veía SOLO al abrir la factura, o sea que para
-- enterarte de que el comprobante coincide había que entrar una por una — y
-- para eso no hace falta un control automático.
--
-- `v_pagos_facturas` suma `control_estado` y `control_nota` del último control
-- de cada factura, por LATERAL. Así la lista lo muestra sin una consulta por
-- fila, y de paso queda disponible para filtrar más adelante.
--
-- Las dos van AL FINAL del SELECT: `create or replace view` no deja insertar
-- columnas en el medio (42P16). Mismo motivo que en 20260921h.
-- =====================================================================

create or replace view public.v_pagos_facturas as
 SELECT f.id, f.proveedor_id, f.tipo_comprobante, f.numero, f.numero_norm, f.fecha, f.vence_el,
    f.neto, f.iva, f.percepciones, f.otros, f.total, f.imputable, f.forma_pago_prevista, f.estado,
    f.paga_cliente, f.pagada_al_cargar, f.aprobada_por, f.aprobada_at, f.motivo_observacion,
    f.observada_por, f.observada_at, f.motivo_anulacion, f.anulado_por, f.anulado_at,
    f.descripcion, f.obs, f.created_at, f.updated_at, f.created_by, f.updated_by,
    p.razon_social AS proveedor_nom, p.cuit AS proveedor_cuit, p.activo AS proveedor_activo,
    p.alias_cbu AS proveedor_alias, p.cbu AS proveedor_cbu, "right"(p.cbu, 4) AS proveedor_cbu_ultimos4,
    p.datos_pago_actualizados_at, p.datos_pago_actualizados_por,
    f.aprobada_at IS NOT NULL AND p.datos_pago_actualizados_at > f.aprobada_at AS cuenta_cambio_tras_aprobar,
    pa.nombre AS aprobada_por_nombre, pc.nombre AS created_by_nombre,
    po.nombre AS observada_por_nombre, pn.nombre AS anulado_por_nombre,
    COALESCE(pg.pagado, 0::numeric)::numeric(14,2) AS pagado,
    COALESCE(pg.acreditado, 0::numeric)::numeric(14,2) AS acreditado,
        CASE WHEN f.paga_cliente OR f.estado = 'anulada'::text THEN 0::numeric
             ELSE f.total - COALESCE(pg.pagado, 0::numeric) - COALESCE(pg.acreditado, 0::numeric)
        END::numeric(14,2) AS saldo,
    (f.estado = ANY (ARRAY['pendiente'::text, 'observada'::text, 'aprobada'::text, 'pagada_parcial'::text])) AND NOT f.paga_cliente AND f.vence_el IS NOT NULL AND f.vence_el < hoy_ar() AS vencida,
    hoy_ar() - f.vence_el AS dias_vencida,
    f.pagada_al_cargar AND f.aprobada_at IS NULL AND f.estado <> 'anulada'::text AS sin_revisar,
    to_char(f.fecha::timestamp with time zone, 'YYYY-MM'::text) AS mes_emision,
    im.centro_costo, im.centros, im.obras_cod, im.centros_cc, im.es_interna, im.todas_archivadas,
    COALESCE(adj.tiene_factura_adj, false) AS tiene_factura_adj,
    f.numero IS NULL AS sin_numero,
        CASE WHEN ult.numero IS NULL THEN NULL::text
             ELSE 'OP-'::text || lpad(ult.numero::text, 4, '0'::text) END AS ultima_op,
    ult.fecha AS ultimo_pago,
    norm_txt((((((((((COALESCE(f.numero, ''::text) || ' '::text) || p.razon_social) || ' '::text) || COALESCE(p.cuit, ''::text)) || ' '::text) || f.descripcion) || ' '::text) || COALESCE(im.centros, ''::text)) || ' '::text) || f.obs) AS busq,
    ctrl.estado AS control_estado,
    ctrl.nota   AS control_nota
   FROM pagos_facturas f
     JOIN pagos_proveedores p ON p.id = f.proveedor_id
     LEFT JOIN profiles pa ON pa.id = f.aprobada_por
     LEFT JOIN profiles pc ON pc.id = f.created_by
     LEFT JOIN profiles po ON po.id = f.observada_por
     LEFT JOIN profiles pn ON pn.id = f.anulado_por
     LEFT JOIN LATERAL ( SELECT sum(l.monto) FILTER (WHERE l.tipo = 'factura'::text) AS pagado,
            sum(l.monto) FILTER (WHERE l.tipo = 'nota_credito'::text) AS acreditado
           FROM pagos_orden_lineas l JOIN pagos_ordenes o ON o.id = l.orden_id
          WHERE l.factura_id = f.id AND o.estado = 'emitida'::text) pg ON true
     LEFT JOIN LATERAL ( SELECT (array_agg(_pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) ORDER BY i.monto DESC, i.id))[1] AS centro_costo,
            string_agg((_pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) || ' $'::text) || round(i.monto), ' · '::text ORDER BY i.monto DESC, i.id) AS centros,
            array_agg(i.obra_cod ORDER BY i.monto DESC, i.id) AS obras_cod,
            array_agg(DISTINCT _pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito)) AS centros_cc,
            bool_or(o.es_interna OR o.es_deposito) AS es_interna,
            bool_and(COALESCE(o.archivada, false)) AS todas_archivadas
           FROM pagos_imputaciones i JOIN obras o ON o.cod = i.obra_cod
          WHERE i.factura_id = f.id) im ON true
     LEFT JOIN LATERAL ( SELECT bool_or(a.tipo = 'factura'::text) AS tiene_factura_adj
           FROM pagos_facturas_adjuntos a
          WHERE a.factura_id = f.id AND a.deleted_at IS NULL) adj ON true
     LEFT JOIN LATERAL ( SELECT o.numero, o.fecha
           FROM pagos_orden_lineas l JOIN pagos_ordenes o ON o.id = l.orden_id
          WHERE l.factura_id = f.id AND o.estado = 'emitida'::text
          ORDER BY o.fecha DESC, o.id DESC LIMIT 1) ult ON true
     LEFT JOIN LATERAL ( SELECT c.estado, c.nota
           FROM pagos_facturas_control c
          WHERE c.factura_id = f.id
          ORDER BY c.created_at DESC, c.id DESC LIMIT 1) ctrl ON true;
