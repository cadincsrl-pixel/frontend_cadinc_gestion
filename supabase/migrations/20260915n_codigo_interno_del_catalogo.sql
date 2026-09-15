-- Código interno propio para cada ficha del catálogo: C-<id>
--
-- Pedido del user: "el código de proveedor es código interno de ellos; qué tal
-- si mostramos o podemos cargar con código interno nuestro? por ejemplo
-- pinceles podamos anotar en cada pincel el código interno así estén seguros de
-- lo que despachen".
--
-- Hoy la ficha no tiene código propio. Lo único parecido son los códigos de
-- lista DEL PROVEEDOR guardados como primer alias (674 de las 2.521 fichas
-- activas: los 2110/4282/6075 de Awaduct, la tornillería). Identifican el
-- artículo en el catálogo del proveedor, no en el nuestro, y dos proveedores
-- pueden repetir el mismo número.
--
-- ── POR QUÉ CON PREFIJO Y NO UN NÚMERO PELADO ─────────────────────────
-- El buscador del pedido (`matchesSearch`) parte el query en palabras y exige
-- que TODAS aparezcan como substring del nombre + alias. Medido sobre el
-- catálogo real: de los 2.521 números correlativos, **949 (el 37,6%) ya
-- aparecen como texto en alguna ficha** — "115" está en la amoladora de 115mm y
-- en los cuatro discos de 115. Un código numérico pelado heredaba ese choque en
-- más de un tercio del catálogo, que es el problema de los alias cortos de
-- §5.15 pero a escala.
--
-- Con el prefijo desaparece: "c-" seguido de número da CERO coincidencias en
-- los 2.521 nombres y alias de hoy. `C-128` sólo puede encontrar una cosa.
--
-- ── POR QUÉ COLUMNA GENERADA Y NO UNA ASIGNADA ────────────────────────
-- El número ya existe: es el `id`. Derivarlo hace que sea único desde el primer
-- día sin migrar nada, que no se pueda desincronizar, y que si una ficha se
-- fusiona o se da de baja su código se retire con ella. `generated always as
-- ... stored` lo garantiza a nivel base: no hay forma de escribirlo mal.
--
-- Sin dígito verificador a propósito: la confirmación real es que la pantalla
-- muestra el NOMBRE cuando tipeás el código. Escribir C-123 en vez de C-128 no
-- da un error de validación, da "Cinta aisladora" donde esperabas un pincel, y
-- eso lo agarra cualquiera.

alter table public.stock_materiales
  add column if not exists codigo text generated always as ('C-' || id) stored;

comment on column public.stock_materiales.codigo is
  'Código interno de CADINC, C-<id>. Generado, no se escribe. Se anota en el producto y se tipea en el pedido y el despacho. Distinto del código de lista del proveedor, que vive en alias[1] en 674 fichas.';

-- Índice para buscar por código exacto sin escanear la tabla.
create index if not exists stock_materiales_codigo_idx
  on public.stock_materiales (codigo);

-- ── La vista del catálogo ─────────────────────────────────────────────
-- Se agrega `codigo` al final (create or replace view exige que las columnas
-- que ya estaban conserven nombre, tipo y posición) y se mete el código en
-- `busq`, que es por donde busca el server.
--
-- Va en las DOS formas, "C-128" y "c128", porque `norm_txt` se come el guion:
-- norm_txt('C-128') = 'c 128'. Con las dos, tipear "c128" cae exacto en una
-- sola ficha, y tipear "C-128" también la encuentra (aunque además traiga lo
-- que contenga 128, que es aceptable: la ficha buscada está en la lista).
create or replace view public.v_catalogo_materiales as
 SELECT m.id,
    m.rubro_id,
    r.nombre AS rubro,
    r.icono AS rubro_icono,
    m.nombre,
    m.unidad,
    m.precio_ref,
    m.precio_actualizado_en,
    m.proveedor_id,
    pp.nombre AS proveedor_nombre,
    m.alias,
    m.clase,
    m.activo,
    m.usa_color,
    m.stock_actual,
    m.obs,
    m.updated_at,
    norm_txt((((m.nombre || ' '::text) || COALESCE(array_to_string(m.alias, ' '::text), ''::text)) || ' '::text) || r.nombre
             || ' ' || m.codigo || ' c' || m.id) AS busq,
    u.precio_unit AS uc_precio,
    u.proveedor_nombre AS uc_proveedor,
    u.fecha AS uc_fecha,
    u.solicitud_id AS uc_pedido,
    u.obra_cod AS uc_obra,
        CASE
            WHEN m.precio_ref = 0::numeric AND u.precio_unit IS NULL THEN 'sin_precio'::text
            WHEN m.precio_ref = 0::numeric THEN 'tasar'::text
            WHEN u.precio_unit IS NULL THEN 'sin_compra'::text
            WHEN NOT unidad_compatible(u.unidad, m.unidad) THEN 'unidad_distinta'::text
            WHEN (abs(u.precio_unit - m.precio_ref) / m.precio_ref) > 0.005 THEN 'desactualizado'::text
            ELSE 'al_dia'::text
        END AS estado_precio,
        CASE
            WHEN m.precio_ref > 0::numeric AND u.precio_unit IS NOT NULL AND unidad_compatible(u.unidad, m.unidad) THEN round((u.precio_unit - m.precio_ref) / m.precio_ref * 100::numeric)
            ELSE NULL::numeric
        END AS dif_pct,
    u.unidad AS uc_unidad,
    u.precio_unit IS NOT NULL AND unidad_compatible(u.unidad, m.unidad) AS uc_unidad_ok,
    m.foto_url,
    m.codigo
   FROM stock_materiales m
     JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores pp ON pp.id = m.proveedor_id
     LEFT JOIN v_material_ultima_compra u ON u.material_id = m.id;
