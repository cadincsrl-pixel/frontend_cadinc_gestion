-- =====================================================================
-- La vista de proveedores tiene que mostrar el modo de vencimiento (2026-09-21)
--
-- `20260921g` agregó `vencimiento_modo` y `cierre_dia` a la tabla, pero el
-- frontend NO lee la tabla: lee `v_pagos_proveedores`, que tiene lista de
-- columnas explícita. Una vista así no hereda las columnas nuevas, así que el
-- modo llegaba `undefined` y el cálculo caía siempre al camino viejo — la
-- configuración se guardaba y no hacía nada.
--
-- Se detectó probándolo en el navegador: el proveedor quedaba en
-- `cierre_mensual` en la base y el modal seguía proponiendo el vencimiento por
-- días. Recordatorio de siempre: agregar una columna no alcanza, hay que
-- seguirla hasta la vista que la UI consume.
--
-- Las dos van AL FINAL del SELECT a propósito: `create or replace view` no deja
-- insertar columnas en el medio (42P16, "cannot change name of view column"),
-- sólo agregarlas al final. Meterlas al lado de `plazo_pago_dias`, que es donde
-- se leerían mejor, obligaría a DROP + CREATE y a rehacer los GRANT.
-- =====================================================================

create or replace view public.v_pagos_proveedores as
 SELECT p.id,
    p.razon_social,
    p.razon_social_norm,
    p.cuit,
    p.alias_cbu,
    p.cbu,
    "right"(p.cbu, 4) AS cbu_ultimos4,
    p.banco,
    p.plazo_pago_dias,
    p.contacto,
    p.telefono,
    p.email,
    p.obs,
    p.activo,
    p.baja_motivo,
    p.baja_por,
    p.baja_at,
    p.datos_pago_actualizados_at,
    p.datos_pago_actualizados_por,
    p.created_at,
    p.updated_at,
    p.created_by,
    p.updated_by,
    pb.nombre AS baja_por_nombre,
    pd.nombre AS datos_pago_actualizados_por_nombre,
    COALESCE(s.saldo, 0::numeric)::numeric(14,2) AS saldo,
    COALESCE(s.saldo_aprobado, 0::numeric)::numeric(14,2) AS saldo_aprobado,
    COALESCE(ac.a_cuenta, 0::numeric)::numeric(14,2) AS a_cuenta_sin_aplicar,
    ac.ultimo_pago,
    COALESCE(fc.facturas, 0::bigint)::integer AS facturas,
    p.cbu IS NULL AND p.alias_cbu IS NULL AS sin_datos_pago,
    norm_txt((((((p.razon_social || ' '::text) || COALESCE(p.cuit, ''::text)) || ' '::text) || COALESCE(p.alias_cbu, ''::text)) || ' '::text) || p.contacto) AS busq,
    p.vencimiento_modo,
    p.cierre_dia
   FROM pagos_proveedores p
     LEFT JOIN profiles pb ON pb.id = p.baja_por
     LEFT JOIN profiles pd ON pd.id = p.datos_pago_actualizados_por
     LEFT JOIN LATERAL ( SELECT sum(v.saldo) AS saldo,
            sum(v.saldo) FILTER (WHERE v.estado = ANY (ARRAY['aprobada'::text, 'pagada_parcial'::text])) AS saldo_aprobado
           FROM v_pagos_facturas v
          WHERE v.proveedor_id = p.id AND NOT v.paga_cliente AND (v.estado = ANY (ARRAY['pendiente'::text, 'observada'::text, 'aprobada'::text, 'pagada_parcial'::text]))) s ON true
     LEFT JOIN LATERAL ( SELECT sum(l.monto) FILTER (WHERE l.tipo = 'a_cuenta'::text) AS a_cuenta,
            max(o.fecha) AS ultimo_pago
           FROM pagos_ordenes o
             LEFT JOIN pagos_orden_lineas l ON l.orden_id = o.id
          WHERE o.proveedor_id = p.id AND o.estado = 'emitida'::text) ac ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS facturas
           FROM pagos_facturas f
          WHERE f.proveedor_id = p.id AND f.estado <> 'anulada'::text) fc ON true;

do $$
declare n integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'v_pagos_proveedores'
     and column_name in ('vencimiento_modo', 'cierre_dia');
  if n <> 2 then
    raise exception 'LA_VISTA_NO_EXPONE_EL_MODO: % de 2', n;
  end if;
end $$;
