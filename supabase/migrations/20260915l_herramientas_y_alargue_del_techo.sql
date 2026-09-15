-- Las cuatro fichas que faltaban del pedido del techo (807), con el user al lado
--
-- Confirmó renglón por renglón qué era cada texto libre:
--   3962 "prolongacion x 100 mts"     → "es un alargue de 100 m"
--   3963 "Amoladora Inalambrica"      → "es herramienta, creala"
--   3964 "Cepillo para agujereadora"  → foto: cepillo de alambre COPA con vástago
--                                       redondo, o sea el de taladro (el de
--                                       amoladora, ficha 2679, ya existía)
--   3967 "Tubo 11 con encastre de 1/4"→ "es herramienta, es bocallave mal
--                                       llamado tubo"
--
-- Las tres herramientas van con clase='herramienta' y rubro 26, como manda
-- §5.12. NO llevan precio: una herramienta no tiene precio ni entra en la
-- cuenta del cliente, va y vuelve de la obra.
--
-- Al vincular el renglón, `trg_item_cache_herr_origen` recalcula `herr_origen`
-- solo y `trg_herr_entregas_sync` hace que el pañol las tome. Por eso alcanza
-- con el update de `material_id`.
--
-- ⚠ EL ENCASTRE DE LA BOCALLAVE. El renglón dice 1/4" y el user escribió
-- "11/4", pero la foto que mandó es una Bremen de **encastre 1/2**. Va con 1/4"
-- porque es lo que pidió Nicolás en el pedido y lo que tipeó el user; la foto
-- parece haber sido para explicar QUÉ es una bocallave, no la medida. Si es
-- 1/2, se corrige el nombre y el alias y listo.
--
-- ⚠ LA AMOLADORA VA SIN MEDIDA. El renglón no la dice. Sus tres hermanas son
-- 4 1/2", 7" y 9"; la mayoría de las inalámbricas son de 4 1/2" pero no se
-- inventa: si es de una medida concreta, se renombra.
--
-- SOBRE LOS ALIAS, criterio de §5.15: ninguno de estos lleva la palabra sola
-- ("amoladora", "cepillo", "bocallave", "tubo", "alargue"), porque cada una ya
-- es el nombre o el alias de fichas hermanas distintas. Todos llevan la medida
-- o el calificativo que los distingue. Ojo especial con "bocallave": la ficha
-- 1229 se llama así y es de CERRAJERÍA (rubro Aberturas) — misma palabra, otro
-- producto.

do $mig$
declare v_id integer;
begin
  -- ── Alargue de 100m ────────────────────────────────────────────────
  -- La familia está partida: 10m y 15m son herramienta/rubro 26, y 5m y 20m
  -- quedaron como material/rubro Electricidad. Se sigue a las que tienen
  -- alias y coinciden con el glosario ("va y vuelve de la obra" = herramienta).
  -- Las otras dos NO se tocan acá: reclasificarlas mueve plata (les borraría
  -- las filas de la cuenta del cliente) y es decisión del user.
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Prolongación 100m');
  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Prolongación 100m', 'unid', 26, 'herramienta', true, 0,
            array['alargue 100','alargue de 100','alargue 100m','alargue de 100m',
                  'alargue 100ml','alargue de 100 metros','alargues de 100',
                  'alargue 100 mts','prolongacion 100','prolongacion de 100',
                  'prolongacion x 100 mts','rollo alargue 100']::text[])
    returning id into v_id;
  end if;
  update public.solicitud_compra_item
     set material_id = v_id, descripcion = 'Prolongación 100m'
   where id = 3962 and estado = 'pendiente' and material_id is null;

  -- ── Amoladora angular inalámbrica ──────────────────────────────────
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Amoladora angular inalámbrica');
  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Amoladora angular inalámbrica', 'unid', 26, 'herramienta', true, 0,
            array['amoladora inalambrica','amoladora angular inalambrica',
                  'amoladora a bateria','amoladora de bateria','amoladora con bateria',
                  'amoladora sin cable','amoladora inalambrica a bateria',
                  'amoladora bateria']::text[])
    returning id into v_id;
  end if;
  update public.solicitud_compra_item
     set material_id = v_id, descripcion = 'Amoladora angular inalámbrica'
   where id = 3963 and estado = 'pendiente' and material_id is null;

  -- ── Cepillo de alambre copa p/ taladro ─────────────────────────────
  -- Hermana de la 2679 (copa para amoladora): mismo cepillo, otro vástago.
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Cepillo de alambre copa p/ taladro');
  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Cepillo de alambre copa p/ taladro', 'unid', 26, 'herramienta', true, 0,
            array['cepillo para agujereadora','cepillo agujereadora',
                  'cepillo para taladro','cepillo taladro','cepillo de alambre para taladro',
                  'cepillo alambre taladro','cepillo copa taladro','cepillo copa para taladro',
                  'cepillo de acero para taladro','copa de alambre taladro',
                  'cepillo circular taladro']::text[])
    returning id into v_id;
  end if;
  update public.solicitud_compra_item
     set material_id = v_id, descripcion = 'Cepillo de alambre copa p/ taladro'
   where id = 3964 and estado = 'pendiente' and material_id is null;

  -- ── Bocallave hexagonal 11mm encastre 1/4" ─────────────────────────
  -- "tubo 11" va como alias a propósito: es como lo pide la obra, aunque el
  -- nombre correcto sea bocallave (lo aclaró el user).
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Bocallave hexagonal 11mm encastre 1/4"');
  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Bocallave hexagonal 11mm encastre 1/4"', 'unid', 26, 'herramienta', true, 0,
            array['bocallave 11','bocallave 11mm','bocallave hexagonal 11',
                  'boca llave 11','tubo 11','tubo 11mm','tubo 11 encastre 1/4',
                  'tubo 11 con encastre de 1/4','llave tubo 11','dado 11','dado 11mm',
                  'bocallave 11 encastre 1/4']::text[])
    returning id into v_id;
  end if;
  update public.solicitud_compra_item
     set material_id = v_id, descripcion = 'Bocallave hexagonal 11mm encastre 1/4"'
   where id = 3967 and estado = 'pendiente' and material_id is null;
end $mig$;
