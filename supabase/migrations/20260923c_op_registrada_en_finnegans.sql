-- =====================================================================
-- La orden de pago se marca como registrada en Finnegans (2026-09-23)
--
-- Pedido del contador (vía el dueño): «para que no se le pase de registrar
-- nada, que en su pantalla le aparezca por OP un botón de registrar y tenga
-- que meter el número de OP de Finnegans».
--
-- El contador pasa cada OP del sistema a Finnegans a mano. Sin una marca, la
-- única forma de saber qué falta es comparar las dos listas; con la marca, lo
-- pendiente es un filtro («Sin registrar») y un número en la pantalla.
--
-- Decisiones:
--   · El número es OBLIGATORIO para marcarla: es lo que después permite ir de
--     una OP a la otra. Texto libre, porque no conocemos el formato de
--     Finnegans y no vale la pena adivinarlo.
--   · UN número de Finnegans, UNA OP. El índice único frena cargar el mismo
--     número en dos órdenes, que es el error típico de copiar y pegar.
--   · Sólo se registra una OP `emitida`. Si una OP registrada se ANULA después,
--     el número queda: la pantalla la muestra como «anulada — anulala también
--     en Finnegans», que es justo lo que no se puede olvidar.
--   · Se puede deshacer (número mal tipeado). No toca plata: ninguna de estas
--     columnas está en trg_pagos_orden_congelada.
-- =====================================================================

alter table public.pagos_ordenes
  add column if not exists numero_finnegans text,
  add column if not exists registrada_at    timestamptz,
  add column if not exists registrada_por   uuid references auth.users(id);

alter table public.pagos_ordenes
  drop constraint if exists pagos_ordenes_registro_chk;
alter table public.pagos_ordenes
  add constraint pagos_ordenes_registro_chk check (
    (numero_finnegans is null and registrada_at is null)
    or (length(btrim(numero_finnegans)) > 0 and registrada_at is not null));

create unique index if not exists pagos_ordenes_numero_finnegans_uidx
  on public.pagos_ordenes (upper(btrim(numero_finnegans)))
  where numero_finnegans is not null;

comment on column public.pagos_ordenes.numero_finnegans is
  'Número de la OP en Finnegans, cargado por el contador al registrarla (20260923c). NULL = sin registrar.';

-- La vista: MISMA lista de columnas que la viva (create or replace no deja
-- insertar ni reordenar, 42P16) y las nuevas al final.
create or replace view public.v_pagos_ordenes as
 SELECT o.id,
    o.numero,
    'OP-'::text || lpad(o.numero::text, 4, '0'::text) AS numero_fmt,
    o.proveedor_id,
    o.fecha,
    o.fecha_cobro,
    o.forma_pago,
    o.referencia,
    o.cbu_destino,
    o.alias_destino,
    "right"(o.cbu_destino, 4) AS cbu_destino_ultimos4,
    o.monto_pagado,
    o.monto_nc,
    o.monto_aplicado,
    o.estado,
    o.motivo_anulacion,
    o.anulado_por,
    o.anulado_at,
    o.obs,
    o.created_at,
    o.updated_at,
    o.created_by,
    o.updated_by,
    p.razon_social AS proveedor_nom,
    p.cuit AS proveedor_cuit,
    pc.nombre AS created_by_nombre,
    pn.nombre AS anulado_por_nombre,
    ln.facturas,
    COALESCE(ln.cantidad_facturas, 0::bigint)::integer AS cantidad_facturas,
    COALESCE(ln.a_cuenta, 0::numeric)::numeric(14,2) AS a_cuenta,
    COALESCE(ln.nc, 0::numeric) > 0::numeric AS tiene_nc,
    COALESCE(adj.tiene_comprobante, false) AS tiene_comprobante,
    COALESCE(adj.tiene_nc_adjunto, false) AS tiene_nc_adjunto,
    o.monto_pagado > 0::numeric AND (o.forma_pago = ANY (ARRAY['transferencia'::text, 'echeq'::text])) AS comprobante_requerido,
    o.estado = 'emitida'::text AND o.fecha_cobro IS NOT NULL AND o.fecha_cobro > hoy_ar() AS en_cartera,
    to_char(o.fecha::timestamp with time zone, 'YYYY-MM'::text) AS mes_pago,
    norm_txt((((((((((('op '::text || o.numero::text) || ' '::text) || p.razon_social) || ' '::text) || COALESCE(p.cuit, ''::text)) || ' '::text) || o.referencia) || ' '::text) || COALESCE(ln.facturas, ''::text)) || ' '::text) || o.obs) AS busq,
    COALESCE(av.aviso_proveedor, false) AS aviso_proveedor,
    COALESCE(av.aviso_contador, false) AS aviso_contador,
    av.aviso_ultimo_at,
    NULLIF(btrim(COALESCE(p.email, ''::text)), ''::text) AS proveedor_email,
    -- 20260923c
    o.numero_finnegans,
    o.registrada_at,
    pr.nombre AS registrada_por_nombre
   FROM pagos_ordenes o
     JOIN pagos_proveedores p ON p.id = o.proveedor_id
     LEFT JOIN profiles pc ON pc.id = o.created_by
     LEFT JOIN profiles pn ON pn.id = o.anulado_por
     LEFT JOIN profiles pr ON pr.id = o.registrada_por
     LEFT JOIN LATERAL ( SELECT string_agg(
                CASE
                    WHEN l.tipo = 'a_cuenta'::text THEN 'a cuenta'::text
                    WHEN l.tipo = 'nota_credito'::text THEN (((('NC '::text || l.nc_numero) || ' s/ '::text) || f.tipo_comprobante) || ' '::text) || COALESCE(f.numero, 's/n'::text)
                    ELSE (f.tipo_comprobante || ' '::text) || COALESCE(f.numero, 's/n'::text)
                END, ', '::text ORDER BY l.id) AS facturas,
            count(DISTINCT l.factura_id) AS cantidad_facturas,
            sum(l.monto) FILTER (WHERE l.tipo = 'a_cuenta'::text) AS a_cuenta,
            sum(l.monto) FILTER (WHERE l.tipo = 'nota_credito'::text) AS nc
           FROM pagos_orden_lineas l
             LEFT JOIN pagos_facturas f ON f.id = l.factura_id
          WHERE l.orden_id = o.id) ln ON true
     LEFT JOIN LATERAL ( SELECT bool_or(a.tipo = 'comprobante_pago'::text) AS tiene_comprobante,
            bool_or(a.tipo = 'nota_credito'::text) AS tiene_nc_adjunto
           FROM pagos_ordenes_adjuntos a
          WHERE a.orden_id = o.id AND a.deleted_at IS NULL) adj ON true
     LEFT JOIN LATERAL ( SELECT bool_or(v.destinatario = 'proveedor'::text) AS aviso_proveedor,
            bool_or(v.destinatario = 'contador'::text) AS aviso_contador,
            max(v.enviado_at) AS aviso_ultimo_at
           FROM pagos_ordenes_avisos v
          WHERE v.orden_id = o.id AND v.estado = 'enviado'::text) av ON true;
