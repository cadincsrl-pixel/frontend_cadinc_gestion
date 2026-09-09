-- Precios propuestos: que los cargue quien compra y los apruebe el dueño
--
-- Desde el 08/09 el precio de la cuenta solo lo toca quien tiene el flag
-- `certificaciones.cargar_precios` (hoy: el dueño). Es correcto —el precio es
-- lo que se le factura al cliente— pero deja afuera al que tiene el dato:
-- Nicolás compra en cuenta corriente, POLLANO le pasa la cuenta unos días
-- después, y él es el que sabe cuánto salió. Hoy choca contra un 403
-- (SIN_PERMISO_CARGAR_PRECIOS); Diego chocó tres veces el 08/09.
--
-- El user (09/09): "¿cómo podemos hacer para que lo cargue y yo lo apruebe?".
--
-- Se copia el patrón que el sistema ya usa para los ajustes de stock
-- (declarar → aprobar/rechazar con motivo, capacidad `aprobar_ajustes_stock`):
--
--   · quien resuelve compras PROPONE un precio → queda en `precio_propuesto`,
--     sin tocar `precio_unit`. La cuenta del cliente NO se mueve.
--   · quien tiene `cargar_precios` (o admin) aprueba —el propuesto pasa a ser
--     el precio real, en el ítem y en la cuenta— o rechaza con motivo.
--
-- Las columnas van en el RENGLÓN y no en una tabla nueva: hay a lo sumo una
-- propuesta viva por renglón, y el rastro de las anteriores queda en
-- `solicitud_item_eventos` (acciones precio_propuesto / precio_aprobado /
-- precio_rechazado), que es donde ya vive la historia del ítem.

alter table public.solicitud_compra_item
  add column if not exists precio_propuesto      numeric(14,2),
  add column if not exists precio_propuesto_por  uuid references auth.users(id),
  add column if not exists precio_propuesto_en   timestamptz,
  add column if not exists precio_propuesto_obs  text;

comment on column public.solicitud_compra_item.precio_propuesto is
  'Precio que propuso quien hizo la compra, esperando aprobación de quien tiene '
  'certificaciones.cargar_precios. NO es el precio de la cuenta: hasta que se '
  'apruebe, el renglón sigue valiendo precio_unit.';

-- Un precio propuesto tiene que ser un precio: 0 o negativo no es "sin dato",
-- para eso está esperando_precio (20260912c).
alter table public.solicitud_compra_item
  drop constraint if exists solicitud_compra_item_precio_propuesto_check;
alter table public.solicitud_compra_item
  add constraint solicitud_compra_item_precio_propuesto_check
  check (precio_propuesto is null or precio_propuesto > 0);

-- Los pendientes son pocos: índice parcial, como el de esperando_precio.
create index if not exists solicitud_compra_item_precio_propuesto_idx
  on public.solicitud_compra_item (solicitud_id) where precio_propuesto is not null;

-- La cuenta corriente lo muestra, para que el aprobador vea "hay un precio
-- esperando el OK" sin salir de la pantalla donde mira la obra. Las columnas
-- nuevas van AL FINAL, que es lo único que admite CREATE OR REPLACE VIEW; el
-- resto es la definición vigente al 09/09 tal cual.
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
        CASE
            WHEN m.id IS NULL THEN NULL::boolean
            ELSE unidad_compatible(c.unidad, m.unidad)
        END AS ficha_unidad_ok,
    i.precio_propuesto,
    i.precio_propuesto_por,
    i.precio_propuesto_en,
    i.precio_propuesto_obs
   FROM materiales_a_cuenta_cliente c
     JOIN solicitud_compra_item i ON i.id = c.item_id
     LEFT JOIN obras o ON o.cod = c.obra_cod
     LEFT JOIN stock_materiales m ON m.id = i.material_id
     LEFT JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = c.factura_id
     LEFT JOIN certificados_cliente cc ON cc.id = c.certificado_id;
