-- =====================================================================
-- Compras: la NC del proveedor como comprobante (2026-09-25)
-- Parte 4 de 4: vistas y resumen.
--
-- v_pagos_facturas (mismas columnas, mismo orden; las nuevas AL FINAL,
-- `create or replace view` no deja insertar en el medio):
--   · `acreditado` suma las aplicaciones de NC aprobadas y no anuladas (más
--     las líneas NC viejas de OP, que son 0).
--   · `saldo` = 0 para una NC: nunca es deuda. `vencida` solo facturas.
--   · Nuevas: clase, nc_aplicado (NC: lo que ya aplicó), nc_disponible (NC
--     aprobada: total − aplicado), nc_pendiente (factura: reservado por NC sin
--     aprobar), saldo_pagable (factura: saldo − nc_pendiente, el tope de una
--     OP) y nc_txt (factura: «NC A 0003-00000012 $X, …»; NC: «s/ A 0001-…»).
--
-- v_pagos_proveedor_saldo / v_pagos_proveedores: el crédito de NC aprobadas
-- sin aplicar (`nc_disponible`) baja el `saldo_neto`, como el pago a cuenta.
-- Los conteos de facturas cuentan solo facturas; `para_aprobar` cuenta
-- también NC (se aprueban igual).
--
-- pagos_resumen: el signo lo pone quien agrega (una NC resta total e
-- imputable), filtro nuevo `p_clase` al final (default null = todo),
-- `facturas` cuenta solo facturas y `notas_credito` (columna nueva, al final)
-- cuenta las NC. Se reemplaza la firma (DROP + CREATE): las llamadas por
-- nombre de hoy siguen resolviendo porque `p_clase` tiene default.
-- =====================================================================

-- ── 1) v_pagos_facturas ────────────────────────────────────────────────
create or replace view public.v_pagos_facturas as
 SELECT f.id,
    f.proveedor_id,
    f.tipo_comprobante,
    f.numero,
    f.numero_norm,
    f.fecha,
    f.vence_el,
    f.neto,
    f.iva,
    f.percepciones,
    f.otros,
    f.total,
    f.imputable,
    f.forma_pago_prevista,
    f.estado,
    f.paga_cliente,
    f.pagada_al_cargar,
    f.aprobada_por,
    f.aprobada_at,
    f.motivo_observacion,
    f.observada_por,
    f.observada_at,
    f.motivo_anulacion,
    f.anulado_por,
    f.anulado_at,
    f.descripcion,
    f.obs,
    f.created_at,
    f.updated_at,
    f.created_by,
    f.updated_by,
    p.razon_social AS proveedor_nom,
    p.cuit AS proveedor_cuit,
    p.activo AS proveedor_activo,
    p.alias_cbu AS proveedor_alias,
    p.cbu AS proveedor_cbu,
    "right"(p.cbu, 4) AS proveedor_cbu_ultimos4,
    p.datos_pago_actualizados_at,
    p.datos_pago_actualizados_por,
    f.aprobada_at IS NOT NULL AND p.datos_pago_actualizados_at > f.aprobada_at AS cuenta_cambio_tras_aprobar,
    pa.nombre AS aprobada_por_nombre,
    pc.nombre AS created_by_nombre,
    po.nombre AS observada_por_nombre,
    pn.nombre AS anulado_por_nombre,
    COALESCE(pg.pagado, 0::numeric)::numeric(14,2) AS pagado,
    (COALESCE(pg.acreditado, 0::numeric) + COALESCE(ncf.acreditado, 0::numeric))::numeric(14,2) AS acreditado,
        CASE
            WHEN f.paga_cliente OR f.estado = 'anulada'::text OR f.clase = 'nota_credito'::text THEN 0::numeric
            ELSE f.total - COALESCE(pg.pagado, 0::numeric) - COALESCE(pg.acreditado, 0::numeric) - COALESCE(ncf.acreditado, 0::numeric)
        END::numeric(14,2) AS saldo,
    (f.estado = ANY (ARRAY['pendiente'::text, 'observada'::text, 'aprobada'::text, 'pagada_parcial'::text])) AND NOT f.paga_cliente
      AND f.clase = 'factura'::text AND f.vence_el IS NOT NULL AND f.vence_el < hoy_ar() AS vencida,
    hoy_ar() - f.vence_el AS dias_vencida,
    f.pagada_al_cargar AND f.aprobada_at IS NULL AND f.estado <> 'anulada'::text AS sin_revisar,
    to_char(f.fecha::timestamp with time zone, 'YYYY-MM'::text) AS mes_emision,
    im.centro_costo,
    im.centros,
    im.obras_cod,
    im.centros_cc,
    im.es_interna,
    im.todas_archivadas,
    COALESCE(adj.tiene_factura_adj, false) AS tiene_factura_adj,
    f.numero IS NULL AS sin_numero,
        CASE
            WHEN ult.numero IS NULL THEN NULL::text
            ELSE 'OP-'::text || lpad(ult.numero::text, 4, '0'::text)
        END AS ultima_op,
    ult.fecha AS ultimo_pago,
    norm_txt((((((((((COALESCE(f.numero, ''::text) || ' '::text) || p.razon_social) || ' '::text) || COALESCE(p.cuit, ''::text)) || ' '::text) || f.descripcion) || ' '::text) || COALESCE(im.centros, ''::text)) || ' '::text) || f.obs) AS busq,
    ctrl.estado AS control_estado,
    ctrl.nota AS control_nota,
    f.plan_cheques,
    f.no_gravado,
    f.exento,
    f.cae,
    f.cae_vto,
    f.cbte_tipo_arca,
    f.lectura_estado,
    f.desglose_a_revisar,
    -- ── 20260925d: nota de crédito como comprobante ──
    f.clase,
    COALESCE(ncn.aplicado, 0::numeric)::numeric(14,2) AS nc_aplicado,
        CASE
            WHEN f.clase = 'nota_credito'::text AND f.aprobada_at IS NOT NULL AND f.estado <> 'anulada'::text
            THEN f.total - COALESCE(ncn.aplicado, 0::numeric)
            ELSE 0::numeric
        END::numeric(14,2) AS nc_disponible,
        CASE
            WHEN f.clase = 'factura'::text AND NOT f.paga_cliente AND f.estado <> 'anulada'::text THEN COALESCE(ncf.pendiente, 0::numeric)
            ELSE 0::numeric
        END::numeric(14,2) AS nc_pendiente,
        CASE
            WHEN f.paga_cliente OR f.estado = 'anulada'::text OR f.clase = 'nota_credito'::text THEN 0::numeric
            ELSE GREATEST(f.total - COALESCE(pg.pagado, 0::numeric) - COALESCE(pg.acreditado, 0::numeric)
                          - COALESCE(ncf.acreditado, 0::numeric) - COALESCE(ncf.pendiente, 0::numeric), 0::numeric)
        END::numeric(14,2) AS saldo_pagable,
        CASE
            WHEN f.clase = 'nota_credito'::text THEN ncn.txt
            ELSE ncf.txt
        END AS nc_txt
   FROM pagos_facturas f
     JOIN pagos_proveedores p ON p.id = f.proveedor_id
     LEFT JOIN profiles pa ON pa.id = f.aprobada_por
     LEFT JOIN profiles pc ON pc.id = f.created_by
     LEFT JOIN profiles po ON po.id = f.observada_por
     LEFT JOIN profiles pn ON pn.id = f.anulado_por
     LEFT JOIN LATERAL ( SELECT sum(l.monto) FILTER (WHERE l.tipo = 'factura'::text) AS pagado,
            sum(l.monto) FILTER (WHERE l.tipo = 'nota_credito'::text) AS acreditado
           FROM pagos_orden_lineas l
             JOIN pagos_ordenes o ON o.id = l.orden_id
          WHERE l.factura_id = f.id AND o.estado = 'emitida'::text) pg ON true
     -- NC que acreditan a esta factura (aprobadas = crédito; sin aprobar = reserva).
     LEFT JOIN LATERAL ( SELECT sum(a.monto) FILTER (WHERE n.aprobada_at IS NOT NULL) AS acreditado,
            sum(a.monto) FILTER (WHERE n.aprobada_at IS NULL) AS pendiente,
            string_agg(((((('NC '::text || n.tipo_comprobante) || ' '::text) || COALESCE(n.numero, 's/n'::text)) || ' $'::text) || round(a.monto, 2)::text)
                       || CASE WHEN n.aprobada_at IS NULL THEN ' (sin aprobar)'::text ELSE ''::text END,
                       ', '::text ORDER BY n.fecha, n.id) AS txt
           FROM pagos_nc_aplicaciones a
             JOIN pagos_facturas n ON n.id = a.nc_id
          WHERE a.factura_id = f.id AND n.estado <> 'anulada'::text) ncf ON true
     -- Si la fila es una NC: a qué facturas se aplica.
     LEFT JOIN LATERAL ( SELECT sum(a.monto) AS aplicado,
            string_agg((('s/ '::text || d.tipo_comprobante) || ' '::text) || COALESCE(d.numero, 's/n'::text), ', '::text ORDER BY d.fecha, d.id) AS txt
           FROM pagos_nc_aplicaciones a
             JOIN pagos_facturas d ON d.id = a.factura_id
          WHERE a.nc_id = f.id) ncn ON true
     LEFT JOIN LATERAL ( SELECT (array_agg(_pagos_centro_de(( SELECT vc.razon_social
                   FROM ventas_clientes vc
                  WHERE vc.id = o.cliente_id), o.nom, o.es_interna, o.es_deposito) ORDER BY i.monto DESC, i.id))[1] AS centro_costo,
            string_agg((_pagos_centro_de(( SELECT vc.razon_social
                   FROM ventas_clientes vc
                  WHERE vc.id = o.cliente_id), o.nom, o.es_interna, o.es_deposito) || ' $'::text) || round(i.monto), ' · '::text ORDER BY i.monto DESC, i.id) AS centros,
            array_agg(i.obra_cod ORDER BY i.monto DESC, i.id) AS obras_cod,
            array_agg(DISTINCT _pagos_centro_de(( SELECT vc.razon_social
                   FROM ventas_clientes vc
                  WHERE vc.id = o.cliente_id), o.nom, o.es_interna, o.es_deposito)) AS centros_cc,
            bool_or(o.es_interna OR o.es_deposito) AS es_interna,
            bool_and(COALESCE(o.archivada, false)) AS todas_archivadas
           FROM pagos_imputaciones i
             JOIN obras o ON o.cod = i.obra_cod
          WHERE i.factura_id = f.id) im ON true
     LEFT JOIN LATERAL ( SELECT bool_or(a.tipo = 'factura'::text) AS tiene_factura_adj
           FROM pagos_facturas_adjuntos a
          WHERE a.factura_id = f.id AND a.deleted_at IS NULL) adj ON true
     LEFT JOIN LATERAL ( SELECT o.numero,
            o.fecha
           FROM pagos_orden_lineas l
             JOIN pagos_ordenes o ON o.id = l.orden_id
          WHERE l.factura_id = f.id AND o.estado = 'emitida'::text
          ORDER BY o.fecha DESC, o.id DESC
         LIMIT 1) ult ON true
     LEFT JOIN LATERAL ( SELECT c.estado,
            c.nota
           FROM pagos_facturas_control c
          WHERE c.factura_id = f.id
          ORDER BY c.created_at DESC, c.id DESC
         LIMIT 1) ctrl ON true;

-- ── 2) v_pagos_proveedor_saldo ─────────────────────────────────────────
create or replace view public.v_pagos_proveedor_saldo with (security_invoker = true) as
 SELECT p.id AS proveedor_id,
    p.razon_social,
    p.cuit,
    p.activo,
    p.alias_cbu,
    p.cbu,
    "right"(p.cbu, 4) AS cbu_ultimos4,
    COALESCE(s.facturas_abiertas, 0::bigint)::integer AS facturas_abiertas,
    COALESCE(s.para_aprobar, 0::bigint)::integer AS para_aprobar,
    COALESCE(s.saldo, 0::numeric)::numeric(14,2) AS saldo,
    COALESCE(s.saldo_aprobado, 0::numeric)::numeric(14,2) AS saldo_aprobado,
    COALESCE(s.vencido, 0::numeric)::numeric(14,2) AS vencido,
    s.mas_vieja,
    COALESCE(ac.a_cuenta, 0::numeric)::numeric(14,2) AS a_cuenta_sin_aplicar,
    (COALESCE(s.saldo, 0::numeric) - COALESCE(ac.a_cuenta, 0::numeric) - COALESCE(s.nc_disponible, 0::numeric))::numeric(14,2) AS saldo_neto,
    ac.ultimo_pago,
    COALESCE(s.nc_disponible, 0::numeric)::numeric(14,2) AS nc_disponible
   FROM pagos_proveedores p
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE v.clase = 'factura'::text) AS facturas_abiertas,
            count(*) FILTER (WHERE v.estado = 'pendiente'::text) AS para_aprobar,
            sum(v.saldo) AS saldo,
            sum(v.saldo) FILTER (WHERE v.estado = ANY (ARRAY['aprobada'::text, 'pagada_parcial'::text])) AS saldo_aprobado,
            sum(v.saldo) FILTER (WHERE v.vencida) AS vencido,
            min(v.vence_el) AS mas_vieja,
            sum(v.nc_disponible) AS nc_disponible
           FROM v_pagos_facturas v
          WHERE v.proveedor_id = p.id AND NOT v.paga_cliente AND (v.estado = ANY (ARRAY['pendiente'::text, 'observada'::text, 'aprobada'::text, 'pagada_parcial'::text]))) s ON true
     LEFT JOIN LATERAL ( SELECT sum(l.monto) FILTER (WHERE l.tipo = 'a_cuenta'::text) AS a_cuenta,
            max(o.fecha) AS ultimo_pago
           FROM pagos_ordenes o
             LEFT JOIN pagos_orden_lineas l ON l.orden_id = o.id
          WHERE o.proveedor_id = p.id AND o.estado = 'emitida'::text) ac ON true
  WHERE p.activo OR COALESCE(s.saldo, 0::numeric) > 0::numeric OR COALESCE(ac.a_cuenta, 0::numeric) > 0::numeric
     OR COALESCE(s.nc_disponible, 0::numeric) > 0::numeric;

-- ── 3) v_pagos_proveedores ─────────────────────────────────────────────
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
    p.cierre_dia,
    -- ── 20260925d ──
    COALESCE(s.nc_disponible, 0::numeric)::numeric(14,2) AS nc_disponible,
    (COALESCE(s.saldo, 0::numeric) - COALESCE(ac.a_cuenta, 0::numeric) - COALESCE(s.nc_disponible, 0::numeric))::numeric(14,2) AS saldo_neto
   FROM pagos_proveedores p
     LEFT JOIN profiles pb ON pb.id = p.baja_por
     LEFT JOIN profiles pd ON pd.id = p.datos_pago_actualizados_por
     LEFT JOIN LATERAL ( SELECT sum(v.saldo) AS saldo,
            sum(v.saldo) FILTER (WHERE v.estado = ANY (ARRAY['aprobada'::text, 'pagada_parcial'::text])) AS saldo_aprobado,
            sum(v.nc_disponible) AS nc_disponible
           FROM v_pagos_facturas v
          WHERE v.proveedor_id = p.id AND NOT v.paga_cliente AND (v.estado = ANY (ARRAY['pendiente'::text, 'observada'::text, 'aprobada'::text, 'pagada_parcial'::text]))) s ON true
     LEFT JOIN LATERAL ( SELECT sum(l.monto) FILTER (WHERE l.tipo = 'a_cuenta'::text) AS a_cuenta,
            max(o.fecha) AS ultimo_pago
           FROM pagos_ordenes o
             LEFT JOIN pagos_orden_lineas l ON l.orden_id = o.id
          WHERE o.proveedor_id = p.id AND o.estado = 'emitida'::text) ac ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS facturas
           FROM pagos_facturas f
          WHERE f.proveedor_id = p.id AND f.estado <> 'anulada'::text AND f.clase = 'factura'::text) fc ON true;

-- ── 4) pagos_resumen: signo por clase + p_clase ────────────────────────
drop function if exists public.pagos_resumen(text, bigint, text, text, text[], text, text, text, date, date, text[], boolean, boolean);
create or replace function public.pagos_resumen(
  p_grupo text, p_proveedor_id bigint default null::bigint, p_obra_cod text default null::text, p_centro_costo text default null::text,
  p_estados text[] default null::text[], p_tipo text default null::text, p_forma_pago text default null::text,
  p_vencimiento text default null::text, p_desde date default null::date, p_hasta date default null::date,
  p_palabras text[] default null::text[], p_archivadas boolean default false, p_paga_cliente boolean default null::boolean,
  p_clase text default null::text)
returns table(grupo text, grupo_nom text, es_interna boolean, estado text, facturas integer, total numeric, imputable numeric,
              pagado numeric, acreditado numeric, saldo numeric, saldo_aprobado numeric, vencido numeric, ultimo date,
              notas_credito integer)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with f as (
    select v.* from public.v_pagos_facturas v
     where (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
       and (p_obra_cod is null or p_obra_cod = any(v.obras_cod))
       and (p_centro_costo is null or p_centro_costo = any(v.centros_cc))
       and (p_estados is null or v.estado = any(p_estados))
       and (p_tipo is null or v.tipo_comprobante = p_tipo)
       and (p_forma_pago is null or v.forma_pago_prevista = p_forma_pago)
       and (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
       and (p_paga_cliente is null or v.paga_cliente = p_paga_cliente)
       and (p_clase is null or v.clase = p_clase)
       and (coalesce(p_archivadas, false) or not coalesce(v.todas_archivadas, false))
       and (p_palabras is null or (select bool_and(v.busq like '%' || w || '%') from unnest(p_palabras) w))
       and (p_vencimiento is null or p_vencimiento = 'todas'
            or (p_vencimiento = 'vencidas' and v.vencida)
            or (p_vencimiento in ('7', '30') and v.saldo > 0 and v.estado in ('pendiente','observada','aprobada','pagada_parcial')
                and v.vence_el is not null
                and v.vence_el <= public.hoy_ar() + (case when p_vencimiento in ('7', '30') then p_vencimiento::int else 0 end)))
  ), g as (
    select f.id, f.clase, f.estado, f.total, f.imputable, f.pagado, f.acreditado, f.saldo, f.vencida, f.fecha, f.paga_cliente,
           case when f.clase = 'nota_credito' then -1 else 1 end as sg,
           case when im.obra_cod is null then 1 else im.monto / nullif(f.imputable, 0) end as factor,
           case p_grupo
             when 'proveedor'    then f.proveedor_id::text
             when 'centro_costo' then im.centro
             when 'obra'         then im.obra_cod
             when 'mes_emision'  then f.mes_emision
             when 'estado'       then case when f.paga_cliente then 'paga_cliente' else f.estado end
             when 'forma_pago'   then f.forma_pago_prevista
             when 'vencimiento'  then case when f.saldo <= 0 or f.estado in ('pagada','anulada') then 'sin_saldo'
                                           when f.vence_el is null then 'sin_vencimiento'
                                           when f.vencida then 'vencida'
                                           when f.vence_el <= public.hoy_ar() + 7 then 'vence_7'
                                           when f.vence_el <= public.hoy_ar() + 30 then 'vence_30'
                                           else 'mas_adelante' end
           end as grupo,
           case p_grupo
             when 'proveedor'    then f.proveedor_nom
             when 'centro_costo' then im.centro
             when 'obra'         then im.nom
             when 'estado'       then case when f.paga_cliente then 'Pagó el cliente' else f.estado end
             else null end as grupo_nom,
           case when p_grupo in ('obra', 'centro_costo') then (im.es_interna or im.es_deposito) else null end as es_interna
      from f
      left join lateral (
        select i.obra_cod, i.monto, o.nom, o.es_interna, o.es_deposito,
               public._pagos_centro_de((select vc.razon_social from public.ventas_clientes vc where vc.id = o.cliente_id), o.nom, o.es_interna, o.es_deposito) as centro
          from public.pagos_imputaciones i join public.obras o on o.cod = i.obra_cod
         where p_grupo in ('obra', 'centro_costo') and i.factura_id = f.id) im on true
  )
  select g.grupo, coalesce(max(g.grupo_nom), g.grupo) as grupo_nom, bool_or(g.es_interna) as es_interna,
         case when p_grupo = 'estado' then g.grupo else null end as estado,
         (count(distinct g.id) filter (where g.clase = 'factura'))::int as facturas,
         sum(g.total * g.factor * g.sg) as total, sum(g.imputable * g.factor * g.sg) as imputable,
         sum(g.pagado * g.factor) as pagado, sum(g.acreditado * g.factor) as acreditado,
         sum(g.saldo * g.factor) as saldo,
         sum(g.saldo * g.factor) filter (where g.estado in ('aprobada', 'pagada_parcial') and not g.paga_cliente) as saldo_aprobado,
         sum(g.saldo * g.factor) filter (where g.vencida) as vencido,
         max(g.fecha) as ultimo,
         (count(distinct g.id) filter (where g.clase = 'nota_credito'))::int as notas_credito
    from g
   where g.grupo is not null
   group by g.grupo
  union all
  select 'sin_revisar', 'Sin revisar', null, 'sin_revisar', (count(*) filter (where f.clase = 'factura'))::int,
         sum(f.total * case when f.clase = 'nota_credito' then -1 else 1 end),
         sum(f.imputable * case when f.clase = 'nota_credito' then -1 else 1 end),
         sum(f.pagado), sum(f.acreditado), sum(f.saldo), 0, 0, max(f.fecha),
         (count(*) filter (where f.clase = 'nota_credito'))::int
    from f where p_grupo = 'estado' and f.sin_revisar
  having count(*) > 0
$function$;
revoke all on function public.pagos_resumen(text, bigint, text, text, text[], text, text, text, date, date, text[], boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.pagos_resumen(text, bigint, text, text, text[], text, text, text, date, date, text[], boolean, boolean, text) to service_role;
