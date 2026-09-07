-- 20260907k — Los tres Sika de Concepción PL salen del texto libre (user 2026-09-07)
--
-- Factura A 0025-00025502 de SILVA SRL (proveedor 4), 11/08/2026, marcada
-- "Mercadería pendiente de entrega" — por eso los tres renglones están en
-- `en_proveedor` (pedido 496, obra CC-018 CONCEPCION PL, items 2433/2434/2435).
--
--   7794671801891  SIKAFLOOR 3 QUARTZ TOP GRIS X25KG   90,00  ×  29.039,67
--   014853         SIKA ROD 3/8" X ML                 131,00  ×     749,59
--   016313         SIKA ROD 5/8" X ML                  71,00  ×   1.256,20
--   Subtotal 2.800.956,79 · Descuento 5 % 140.047,84 · Neto 2.660.908,95
--   IVA 21 % 558.790,87 · Percepciones IIBB Tuc. + TEM 66.522,72
--   TOTAL 3.286.222,54
--
-- La factura contesta las dos dudas que tenía el catálogo:
--   · "X ML" = por METRO LINEAL. Los Sika Rod estaban cargados en 'unid' (131 y
--     71 unidades); son 131 y 71 METROS. El Sika Rod es fondo de junta, el
--     cordón de espuma que va abajo del sellador.
--   · "X25KG" = bolsa de 25 kg, no 'unid'.
--
-- PRECIO: final con IVA y con el 5 % de descuento aplicado, SIN percepciones.
-- Es el criterio que ya usan las facturas 33/34/35: en la 35, la suma de los
-- renglones (374.935,64) da exactamente neto + IVA, y la diferencia contra el
-- total de la factura son las percepciones. Correcto: la percepción es un pago
-- a cuenta que CADINC recupera, no el costo del material.
--     precio = unitario × 0,95 × 1,21
--
-- Los precios que estaban cargados venían de un presupuesto anterior y quedaban
-- por encima de la factura: 34.001 vs 33.381,10 · 907 vs 861,65 · 1.520 vs
-- 1.444,00. Sobre 90 bolsas eso solo ya eran $55.790 de más.
--
-- Los tres siguen `en_proveedor` y sin fila en la cuenta del cliente (la escribe
-- `retirar_de_proveedor` recién al retirar), así que corregir precio y unidad
-- ahora no mueve nada ya registrado: lo deja bien para cuando se retire.
-- OJO: la factura avisa que la mercadería se retira antes de los 90 días
-- corridos desde el 11/08/2026, o sea antes del 09/11/2026.

do $$
declare
  v_user     uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro
  v_factura  int;
  v_sikafloor int; v_rod38 int; v_rod58 int;
begin
  -- ═══ 1) la factura ═══════════════════════════════════════════════════════
  select id into v_factura from public.facturas_compra
   where proveedor_id = 4 and numero = '25-25502';
  if v_factura is null then
    insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
    values (4, '25-25502', '2026-08-11', 3286222.54,
            'Factura A 0025-00025502 · Sikafloor-3 QuartzTop + Sika Rod p/ Concepción PL (pedido #496) · '
            'subtotal $2.800.956,79 − 5 % $140.047,84 = neto $2.660.908,95 + IVA 21 % $558.790,87 + '
            'percepciones IIBB Tuc. y TEM $66.522,72. Mercadería pendiente de entrega: retirar antes del '
            '09/11/2026 (90 días). Cargada por SQL (20260907k), sin adjunto.',
            v_user, v_user)
    returning id into v_factura;
  end if;

  -- ═══ 2) las tres fichas ══════════════════════════════════════════════════
  insert into public.stock_materiales
    (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, usa_color, proveedor_id, obs, created_by, updated_by)
  values
    ('Sikafloor-3 QuartzTop gris x 25kg', 'bolsa', round(29039.67 * 0.95 * 1.21, 2), 14,
     array['sikafloor 3 quartz gris x 25 kg','sikafloor 3 quartz top gris x25kg','sikafloor 3 quartztop',
           'quartz top','endurecedor de piso','7794671801891'],
     'material', true, false, 4,
     'Endurecedor de superficie p/ pisos de hormigón, espolvoreado. Alta 2026-09-07 desde la factura '
     'Silva 0025-00025502 (11/08/2026): $29.039,67 − 5 % × 1,21 = precio final con IVA.',
     v_user, v_user),
    ('Sika Rod 3/8" (fondo de junta)', 'm', round(749.59 * 0.95 * 1.21, 2), 8,
     array['sika rod 3/8','sika rod 3/8 x ml','sikarod 3/8','fondo de junta 3/8','014853'],
     'material', true, false, 4,
     'Cordón de espuma que va abajo del sellador. Se vende POR METRO LINEAL ("X ML" en la factura). '
     'Alta 2026-09-07 desde la factura Silva 0025-00025502: $749,59 − 5 % × 1,21.',
     v_user, v_user),
    ('Sika Rod 5/8" (fondo de junta)', 'm', round(1256.20 * 0.95 * 1.21, 2), 8,
     array['sika rod 5/8','sika rod 5/8 x ml','sikarod 5/8','fondo de junta 5/8','016313'],
     'material', true, false, 4,
     'Cordón de espuma que va abajo del sellador. Se vende POR METRO LINEAL ("X ML" en la factura). '
     'Alta 2026-09-07 desde la factura Silva 0025-00025502: $1.256,20 − 5 % × 1,21.',
     v_user, v_user)
  on conflict do nothing;

  select id into v_sikafloor from public.stock_materiales
   where activo and norm_material(nombre) = norm_material('Sikafloor-3 QuartzTop gris x 25kg');
  select id into v_rod38 from public.stock_materiales
   where activo and norm_material(nombre) = norm_material('Sika Rod 3/8" (fondo de junta)');
  select id into v_rod58 from public.stock_materiales
   where activo and norm_material(nombre) = norm_material('Sika Rod 5/8" (fondo de junta)');
  if v_sikafloor is null or v_rod38 is null or v_rod58 is null then
    raise exception 'No se crearon las tres fichas (sikafloor=%, rod38=%, rod58=%)', v_sikafloor, v_rod38, v_rod58;
  end if;

  -- ═══ 3) los tres renglones ═══════════════════════════════════════════════
  create temp table vinc (item_id int, material_id int, nombre text, unidad text, precio numeric) on commit drop;
  insert into vinc values
    (2433, v_sikafloor, 'Sikafloor-3 QuartzTop gris x 25kg', 'bolsa', round(29039.67 * 0.95 * 1.21, 2)),
    (2434, v_rod38,     'Sika Rod 3/8" (fondo de junta)',    'm',     round(749.59  * 0.95 * 1.21, 2)),
    (2435, v_rod58,     'Sika Rod 5/8" (fondo de junta)',    'm',     round(1256.20 * 0.95 * 1.21, 2));

  insert into public.solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
  select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado,
         'Sale del texto libre: ' || i.descripcion || ' → ' || v.nombre
         || '. La factura Silva 0025-00025502 dice ' || case when v.unidad = 'm' then '"X ML" (metro lineal)' else '"X25KG" (bolsa)' end
         || ', así que la unidad pasa de ''' || i.unidad || ''' a ''' || v.unidad || '''.'
         || ' Precio: $' || i.precio_unit || ' → $' || v.precio || ' (unitario de factura − 5 % × 1,21).',
         jsonb_build_object('motivo','sika silva factura 25502 2026-09-07',
                            'material_nuevo', v.material_id, 'unidad_anterior', i.unidad,
                            'precio_anterior', i.precio_unit, 'precio_nuevo', v.precio,
                            'factura', '0025-00025502'),
         v_user
    from vinc v join public.solicitud_compra_item i on i.id = v.item_id
   where i.material_id is null;

  update public.solicitud_compra_item i
     set material_id = v.material_id,
         descripcion = v.nombre,
         unidad      = v.unidad,
         precio_unit = v.precio,
         factura_id  = v_factura,
         updated_by  = v_user
    from vinc v
   where i.id = v.item_id and i.material_id is null;
end $$;
