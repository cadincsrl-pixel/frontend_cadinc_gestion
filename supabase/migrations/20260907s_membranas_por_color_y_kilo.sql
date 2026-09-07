-- 20260907s — Membranas: Sikafill por color y por kilo, y la Venier aparte (user 2026-09-07)
--
-- Salió del recuento. Sosa contó la ficha genérica "Membrana líquida x 20kg" y
-- anotó que adentro hay TRES cosas:
--     1,5 tachos de Sikafill ROJA · 6,5 de Sikafill BLANCA · 2 de Venier Supercapa GRIS
--
-- El user confirmó dos cosas:
--   · "al despachar sikafill el color es muy importante" → van fichas separadas.
--   · "sikafill viene por kg hay que acomodar" → la unidad pasa de balde a KG.
--     Se nota en los datos: había renglones cargados en "lt" a $6.350, que es
--     casi exactamente el precio por kilo ($126.690,78 / 20 = $6.334,54). La
--     gente ya lo pedía por kilo contra una ficha que era un balde.
--
-- Y la Venier Supercapa es POLIURETÁNICA, no membrana líquida acrílica: otro
-- producto, no una variante de color.
--
-- FICHA NUEVA, NO RENAME. La 173 tiene 16 renglones y 15 filas en la cuenta del
-- cliente (una ya cobrada), todas en baldes. Cambiarle la unidad a kg
-- reinterpretaría en silencio esa historia — "3" pasaría de 3 baldes a 3 kg.
-- Así que las nuevas nacen aparte y la 173 queda para lo viejo, sin stock.
--
-- PRECIOS
--   · Sikafill por kg = el precio de referencia actual del balde / 20 =
--     $126.690,78 / 20 = $6.334,54. No es una revaluación: es el mismo precio
--     en otra unidad. Roja y blanca cuestan lo mismo (las 16 compras están
--     entre $126.690 y $137.281 el balde y solo una dice el color). La última
--     compra real fue $128.000 el balde el 02/09, o sea $6.400 el kilo.
--   · Venier: $200.219 el tacho, del aviso que mandó el user (30 % off de
--     $288.308, "precio sin impuestos nacionales $165.470"). Es precio de
--     LISTA DE MERCADO, no una compra nuestra: queda marcado como estimado.
--     ⚠ El aviso dice "20kg" en el título pero tenía seleccionado el chip de
--     25 kg. Se toma 20 kg porque coincide con el título y con "la unidad
--     equivale a 20,00 m²"; si es de 25, hay que renombrarla.
--
-- STOCK que deja el recuento: 30 kg de roja (1,5 × 20), 130 kg de blanca
-- (6,5 × 20) y 2 tachos de Venier. Se cargan como ajustes PENDIENTES, igual que
-- el resto del recuento: no tocan stock hasta que alguien los apruebe.

do $$
declare
  v_user  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_roja  int; v_blanca int; v_venier int;
begin
  insert into public.stock_materiales
    (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, usa_color, obs, created_by, updated_by)
  values
    ('Membrana líquida Sikafill roja x kg', 'kg', round(126690.78/20, 2), 8,
     array['sikafill roja','sikafill fibrada roja','membrana liquida roja','membrana roja',
           'sikafill fibrado rojo','baldes sikafill fibrado rojo 20 kg','membrana liquida fibrada roja'],
     'material', true, false,
     'Sikafill de Sika, color rojo. Se pide POR KILO (el tacho viene de 20 kg, pero se despacha por peso). '
     'Precio: el de referencia del balde ($126.690,78) dividido 20. Separada de la blanca el 2026-09-07 '
     'porque al despachar el color importa (user).',
     v_user, v_user),
    ('Membrana líquida Sikafill blanca x kg', 'kg', round(126690.78/20, 2), 8,
     array['sikafill blanca','sikafill blanco','sikafill fibrado blanco','membrana liquida blanca',
           'membrana blanca','sikafill techos blanco 20','membrana liquida fibrada blanca','sikafill techos'],
     'material', true, false,
     'Sikafill de Sika, color blanco. Se pide POR KILO (el tacho viene de 20 kg, pero se despacha por peso). '
     'Precio: el de referencia del balde ($126.690,78) dividido 20. Separada de la roja el 2026-09-07 '
     'porque al despachar el color importa (user).',
     v_user, v_user),
    ('Membrana poliuretánica Venier Supercapa gris x 20kg', 'balde', 200219, 8,
     array['venier supercapa','supercapa','supercapa gris','membrana poliuretanica','venier gris',
           'supercapa poliuretanica','membrana poliuretanica gris'],
     'material', true, false,
     'NO es membrana líquida acrílica: es poliuretánica elastomérica, otro producto. Alta 2026-09-07 desde '
     'el recuento (Sosa contó 2 tachos). Referencia ESTIMADA de mercado: $200.219 el tacho (aviso que mandó '
     'el user, 30 % off de $288.308). Ajustar con la primera compra real. El aviso decía 20 kg en el título '
     'con el chip de 25 kg marcado: si el tacho es de 25, hay que renombrarla.',
     v_user, v_user)
  on conflict do nothing;

  select id into v_roja   from public.stock_materiales where activo and norm_material(nombre) = norm_material('Membrana líquida Sikafill roja x kg');
  select id into v_blanca from public.stock_materiales where activo and norm_material(nombre) = norm_material('Membrana líquida Sikafill blanca x kg');
  select id into v_venier from public.stock_materiales where activo and norm_material(nombre) = norm_material('Membrana poliuretánica Venier Supercapa gris x 20kg');
  if v_roja is null or v_blanca is null or v_venier is null then
    raise exception 'faltan fichas (roja=%, blanca=%, venier=%)', v_roja, v_blanca, v_venier;
  end if;

  -- El stock del recuento, como ajustes pendientes (igual que 20260907r).
  insert into public.stock_movimientos
    (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
  select v.mid, 'ajuste', v.delta, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07', v.obs, v_user
  from (values
    (v_roja,   30, 'Recuento del depósito 2026-09-07: Sosa contó 1,5 tachos de Sikafill roja = 30 kg. Estaba dentro de la ficha genérica "Membrana líquida x 20kg".'),
    (v_blanca, 130, 'Recuento del depósito 2026-09-07: Sosa contó 6,5 tachos de Sikafill blanca = 130 kg. Estaba dentro de la ficha genérica "Membrana líquida x 20kg".'),
    (v_venier, 2, 'Recuento del depósito 2026-09-07: Sosa contó 2 tachos de Venier Supercapa gris. Es poliuretánica, no membrana líquida: ficha nueva.')
  ) as v(mid, delta, obs)
  where not exists (select 1 from public.stock_movimientos mv
                     where mv.material_id = v.mid and mv.tipo = 'ajuste'
                       and mv.obs like 'Recuento del depósito 2026-09-07:%');
end $$;

-- La genérica queda para los 16 renglones viejos, que están todos en baldes.
update public.stock_materiales
   set nombre = 'Membrana líquida sin especificar x 20kg',
       alias  = array(select a from unnest(alias) a
                       where norm_material(a) not in (
                         'sikafill fibrada roja','sikafill blanca fibrada','sikafill fibrado blanco',
                         'baldes sikafill fibrado rojo 20 kg','sikafill techos blanco 20',
                         'membrana liquida fibrada blanca','sikafill techos')),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: se parte en "Sikafill roja x kg", "Sikafill blanca x kg" y "Venier Supercapa gris" '
             '(esta última es poliuretánica, otro producto). Esta fila queda SOLO para los 16 renglones '
             'viejos, que están en baldes y no dicen color; no se le cambia la unidad para no reinterpretar '
             'esa historia (15 filas en la cuenta del cliente, 1 ya cobrada). Los alias de color se mudaron '
             'a las fichas nuevas.',
       updated_at = now()
 where id = 173;
