-- Dos precisiones del user sobre el pedido del techo (807)
--
-- 1) "la amoladora es 4/1/2" → la inalámbrica que se creó en 20260915l quedó
--    sin medida a propósito, porque el renglón no la decía. Ahora sí: es de
--    4 1/2" (115mm), como la 1107. Se renombra siguiendo el formato de sus tres
--    hermanas — "Amoladora angular N" (Nmm)" — y se le suman los alias con la
--    medida.
--
--    Los alias nuevos SIEMPRE llevan "inalambrica" o "bateria": la ficha 1107
--    (la de cable) ya tiene "amoladora 4 1/2", "amoladora 115" y compañía, y el
--    matcher es `includes()` sobre un blob. Si acá pusiera "amoladora 4 1/2" a
--    secas, buscar eso traería las dos y alguien terminaría pidiendo la que no
--    es. Es el caso de §5.15 sobre fichas hermanas que se distinguen por una
--    sola palabra.
--
-- 2) "la base es base estabilizada" → el renglón 3974 decía "Base
--    Estabilizadora", que es otra cosa (un estabilizador es un aparato; de
--    hecho el catálogo tiene "Estabilizador de tensión" y "Estabilizador p/
--    portón corredizo"). Va como material de Albañilería en bolsa, junto a la
--    arena, la piedra partida y el ripio, que es el vecindario donde se busca.
--
--    ⚠ SIN EL PESO EN EL NOMBRE. La familia usa "x 25kg" (arena, piedra,
--    cemento) o "x bolsa" (ripio). Acá no se inventa: el renglón pide 30
--    bolsas pero nadie dijo de cuántos kilos. Cuando se sepa, se renombra a
--    "Base estabilizada x Nkg" — importa, porque §5.15 ya dejó escrito lo que
--    pasa cuando dos presentaciones comparten alias y se anotan igual.

do $mig$
declare v_id integer;
begin
  -- ── 1. La amoladora, con su medida ─────────────────────────────────
  update public.stock_materiales
     set nombre = 'Amoladora angular inalámbrica 4 1/2" (115mm)',
         alias  = array['amoladora inalambrica','amoladora angular inalambrica',
                        'amoladora a bateria','amoladora de bateria','amoladora con bateria',
                        'amoladora sin cable','amoladora inalambrica a bateria',
                        'amoladora bateria','amoladora inalambrica 4 1/2',
                        'amoladora inalambrica 4.1/2','amoladora inalambrica 115',
                        'amoladora inalambrica 115mm','amoladora a bateria 4 1/2',
                        'amoladora a bateria 115','amoladora inalambrica chica']::text[]
   where id = 2749
     and nombre = 'Amoladora angular inalámbrica';

  update public.solicitud_compra_item
     set descripcion = 'Amoladora angular inalámbrica 4 1/2" (115mm)'
   where id = 3963 and estado = 'pendiente' and material_id = 2749;

  -- ── 2. La base estabilizada ────────────────────────────────────────
  select id into v_id from public.stock_materiales
   where norm_material(nombre) = norm_material('Base estabilizada');
  if v_id is null then
    insert into public.stock_materiales (nombre, unidad, rubro_id, clase, activo, precio_ref, alias)
    values ('Base estabilizada', 'bolsa', 4, 'material', true, 0,
            array['base estabilizada','base estabilizadora','estabilizada',
                  'suelo estabilizado','base de suelo estabilizado',
                  'base estabilizada bolsa','bolsa de base estabilizada']::text[])
    returning id into v_id;
  end if;

  update public.solicitud_compra_item
     set material_id = v_id, descripcion = 'Base estabilizada'
   where id = 3974 and estado = 'pendiente' and material_id is null;
end $mig$;
