-- El color deja de morir en el renglón del pedido
-- ================================================
-- 2026-09-12
--
-- Auditoría del modelo de pinturas (12/09). El color se escribe en
-- `solicitud_compra_item.color`, se muestra como chip en las pantallas de
-- comprar y despachar, Y AHÍ TERMINA: no llega al remito que firma la obra, ni
-- a la cuenta del cliente, ni al certificado. Números al 12/09: 18 de 3.666
-- renglones tienen color cargado, y en el rubro Pintura 0 de 398.
--
-- La consecuencia operativa: el que compra ve el color en pantalla, pero el
-- remito que acompaña el material no lo dice y la cuenta del cliente factura
-- "Cerámico piso 45x45" sin tono. Si el cliente reclama el color, no hay
-- documento emitido que lo respalde. Y como el atributo no sirve para nada,
-- nadie lo llena — el campo está muerto por falta de plomería, no por diseño.
--
-- POR QUÉ NO SE AGREGA UNA COLUMNA `color` A MCC Y AL REMITO: las dos tablas ya
-- llevan una `descripcion` desnormalizada (es la foto del renglón, §5.14), y
-- todos los documentos que importan —remito, PDF del certificado, Excel de la
-- cuenta corriente— ya imprimen ESA descripción. Componiendo el color adentro
-- de la descripción al escribir, el dato llega a los tres lugares sin tocar el
-- schema ni los cinco escritores de MCC por separado. Es además lo que un
-- humano escribiría a mano en el remito.
--
-- NO se toca `devolver_material`: la nota de crédito copia la descripción DESDE
-- MCC, así que hereda el color sola.
--
-- NO se pre-genera ninguna grilla de color × litros. Ese camino ya se midió y
-- fracasó dos veces: 20260902s_color_en_pedidos.sql lo documentó con 19 filas
-- de "Esmalte sintético <color> x <tamaño>" de las que 17 nunca se usaron, y
-- hoy son 23 con 16 muertas. La regla vigente sigue siendo la de
-- 20260908a: "si el color decide que se despacha, es ficha, no atributo".
--
-- SOBRE EL MÉTODO: las tres RPC se parchean leyendo su propia definición con
-- pg_get_functiondef y reemplazando una expresión puntual, en vez de pegar acá
-- los cuerpos completos (80 a 130 líneas cada uno). Es a propósito: pegarlos
-- corre el riesgo de revertir en silencio otro cambio y de errores de
-- transcripción. Cada reemplazo se verifica y la migración ABORTA si el texto
-- buscado no está, así que no puede aplicarse a medias.

begin;

-- ── El helper ─────────────────────────────────────────────────────────
-- IMMUTABLE porque norm_material lo es (verificado en pg_proc.provolatile).
create or replace function desc_con_color(p_desc text, p_color text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case
    when coalesce(trim(p_color), '') = '' then p_desc
    -- Si el color ya está en el nombre de la ficha, no repetirlo. Caso real:
    -- la ficha 799 se llama "… SW 6105 Divine White x 20lts" y además tenía
    -- usa_color prendido, la contradicción que 20260908a pedía evitar.
    when norm_material(coalesce(p_desc, '')) like '%' || norm_material(trim(p_color)) || '%'
      then p_desc
    else coalesce(p_desc, '') || ' (' || trim(p_color) || ')'
  end;
$fn$;

comment on function desc_con_color(text, text) is
  'Compone el color del renglón dentro de la descripción que va al remito, a la '
  'cuenta del cliente y al certificado. No lo repite si ya está en el nombre.';

-- ── Las tres RPC que escriben MCC ─────────────────────────────────────
do $mig$
declare
  v_def  text;
  v_antes text;
  v_desp  text;
begin
  -- resolver_item_compra
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolver_item_compra';
  v_antes := '(v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,';
  v_desp  := '(v_obra_cod, v_item.solicitud_id, p_item_id, desc_con_color(v_item.descripcion, v_item.color),';
  if position(v_antes in v_def) = 0 then
    raise exception 'resolver_item_compra: no encontré la expresión a parchear';
  end if;
  execute replace(v_def, v_antes, v_desp);

  -- resolver_item_despacho (misma expresión)
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolver_item_despacho';
  if position(v_antes in v_def) = 0 then
    raise exception 'resolver_item_despacho: no encontré la expresión a parchear';
  end if;
  execute replace(v_def, v_antes, v_desp);

  -- retirar_de_proveedor: además hay que sumar `color` al SELECT … INTO v_item,
  -- que tiene lista explícita de columnas (las otras dos hacen SELECT *).
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'retirar_de_proveedor';

  v_antes := 'cantidad, precio_unit, factura_id, pagado_por, clase';
  v_desp  := 'cantidad, precio_unit, factura_id, pagado_por, clase, color';
  if position(v_antes in v_def) = 0 then
    raise exception 'retirar_de_proveedor: no encontré el SELECT INTO a parchear';
  end if;
  v_def := replace(v_def, v_antes, v_desp);

  v_antes := '(p_obra_cod, v_item.solicitud_id, v_item.id, v_item.descripcion, v_acum_retirada,';
  v_desp  := '(p_obra_cod, v_item.solicitud_id, v_item.id, desc_con_color(v_item.descripcion, v_item.color), v_acum_retirada,';
  if position(v_antes in v_def) = 0 then
    raise exception 'retirar_de_proveedor: no encontré el INSERT a parchear';
  end if;
  execute replace(v_def, v_antes, v_desp);
end $mig$;

-- CREATE OR REPLACE preserva dueño y ACL, así que los GRANT de
-- 20260527_revoke_secdef_from_public siguen en pie. Se verifica en vez de
-- re-otorgar a ciegas: si alguna quedara ejecutable por `public`, esto aborta.
do $acl$
declare v_mal text;
begin
  select string_agg(p.proname, ', ') into v_mal
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('resolver_item_compra', 'resolver_item_despacho', 'retirar_de_proveedor')
     and has_function_privilege('public', p.oid, 'execute');
  if v_mal is not null then
    raise exception 'Estas RPC SECURITY DEFINER quedaron ejecutables por public: %', v_mal;
  end if;
end $acl$;

-- ── La contradicción de la ficha 799 ─────────────────────────────────
-- Tiene "Divine White" en el nombre Y usa_color=true. Es la única del catálogo
-- en esa situación (verificado sobre 22 raíces de color). Nunca se le cargó un
-- color en un renglón, así que apagarlo no pierde nada.
update stock_materiales set usa_color = false, updated_at = now()
 where id = 799 and usa_color;

commit;
