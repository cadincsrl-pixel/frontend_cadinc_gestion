-- El código interno va con relleno: C-0128, no C-128
--
-- Corrige a `20260915n`, que lo dejó sin relleno. El defecto apareció al
-- probarlo: **254 de los 2.521 códigos son prefijo de otro**. `C-128` es
-- prefijo de C-1280 … C-1289, así que buscarlo devolvía ONCE fichas en vez de
-- una — el pincel y diez módulos de electricidad.
--
-- Eso rompe justo lo que el código venía a resolver ("así estén seguros de lo
-- que despachen"): un código que trae once resultados no da certeza.
--
-- La causa es que las dos búsquedas del sistema son por SUBSTRING
-- (`matchesSearch` en el front, `busq like` en el server), y en ancho variable
-- un número corto siempre es prefijo de uno largo.
--
-- Con relleno a 4 dígitos todos los códigos miden lo mismo, y dos cadenas de
-- igual largo no pueden ser una prefijo de la otra: los choques pasan a CERO,
-- medido sobre el catálogo real.
--
-- Cuatro dígitos alcanzan hasta la ficha 9999; hoy el id más alto es 2752. Si
-- algún día se pasa, los códigos de 5 dígitos siguen sin chocar entre sí, pero
-- conviene revisar esto antes de llegar.

drop view if exists public.v_catalogo_materiales;

alter table public.stock_materiales drop column if exists codigo;

alter table public.stock_materiales
  add column codigo text generated always as ('C-' || lpad(id::text, 4, '0')) stored;

comment on column public.stock_materiales.codigo is
  'Codigo interno de CADINC, C-NNNN con relleno a 4 digitos. Generado, no se escribe. El relleno NO es estetico: en ancho variable un codigo corto es prefijo de uno largo y la busqueda por substring devuelve de mas (eran 254 casos). Distinto del codigo de lista del proveedor, que vive en alias[1] en 674 fichas.';

create index if not exists stock_materiales_codigo_idx
  on public.stock_materiales (codigo);

create view public.v_catalogo_materiales as
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
             || ' ' || m.codigo || ' c' || lpad(m.id::text, 4, '0')) AS busq,
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
