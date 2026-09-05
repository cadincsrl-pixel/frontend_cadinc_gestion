-- 20260905i — Garita, pedido #676: compra a Silva (Factura A 0025-00026056, 05/09/2026)
--
-- El user pasó la factura: "se compró todo ya y está listo para enviar a Garita".
-- Los 10 renglones pendientes pasan a COMPRADO (proveedor Silva #4, pagado por
-- CADINC, obra llave en mano) por la RPC real, con la cantidad comprada de la
-- factura donde difiere del pedido (10 placas y no 1; tacos y tornillos vienen
-- por caja de 100). Quedan "por enviar" hasta el remito. Precios finales =
-- neto × 1,21 (las percepciones de IIBB no van al precio del material).
--
-- La factura destapa dos vínculos mal hechos ayer: "tacos del 6" son TARUGOS
-- SUELTOS (Tarugo nylon 6mm, $25,77 exacto en el catálogo) y no el kit con
-- tornillo; "tornillo del 8" es el TEL-FIX 8 x 1 1/2" común 6 ($41,62, la fila
-- "Tornillo fix 8mm"), no el tornillo de madera 4x40. Se corrigen y los alias
-- se mueven. La factura trae además tacos N°8 y tel-fix 10 x 1 3/4" (para taco
-- 8) que no estaban en el pedido: se agregan como renglones del mismo pedido.
--
-- Renglón                                    cant   neto      final
--  Solera 35 x 2,60                            12  2.965,91  3.588,75
--  Montante 35 x 2,60                          50  3.402,11  4.116,55
--  Placa Durlock STD 12,5                      10 16.526,44 19.997,00
--  T1 aguja 8x9/16 caja x100                  100     22,87     27,67 c/u
--  T2 aguja 6x1" caja x500 ×2               1.000     14,93     18,07 c/u
--  Tacos comunes N°6 c/tope caja x100         100     21,30     25,77 c/u
--  Tel-fix 8 x 1 1/2" común 6 caja x100       100     34,40     41,62 c/u
--  Tacos comunes N°8 c/tope caja x100         100     41,04     49,66 c/u  (nuevo)
--  Tel-fix 10 x 1 3/4" común 8 caja x100      100     50,46     61,06 c/u  (nuevo)
--  Masilla LPU multiuso x 32 kg                 1 41.885,22 50.681,12
--  Cinta fibra autoadhesiva 48 mm x 90 m        1  4.237,34  5.127,18
--  Yeso París Revokito x 1 kg                   2  1.378,51  1.668,00
--  Neto 451.777,60 · IVA 94.873,29 · percepciones 11.294,44 · total 557.945,33

do $$
declare
  v_user  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';   -- Franco Leiro (admin)
  v_fact  int;
  v_fix10 int;
  v_it8   int;
  v_it10  int;
begin
  -- 1) catálogo: nombres, alias y precios de esta factura ─────────────────────
  update public.stock_materiales
     set nombre = 'Tornillo fix N°8 x 1 1/2" (p/ tarugo 6)',
         alias = array(select distinct unnest(alias || array['tornillo fix 8','tel-fix 8','telfix 8','tornillo del 8','tornillos del 8','tornillo n8','tornillo n 8','tornillo 8','tornillos n8','tornillo para taco del 6','tornillo tel-fix 8 x 1 1/2'])),
         precio_ref = 41.62,
         obs = coalesce(obs || ' · ', '') || 'Silva 05/09/2026: TEL-FIX 8 x 1 1/2" común 6, caja x100 $3.439,67 neto → $41,62 c/u. Es el tornillo que va con el taco del 6.'
   where id = 75;

  update public.stock_materiales
     set alias = array(select unnest(alias) except select unnest(array['tornillos del 8','tornillo para taco del 6','tornillo 8','tornillo n8','tornillo del 8','tornillo n 8','tornillos n8'])),
         obs = coalesce(obs || ' · ', '') || 'Los alias "tornillo del 8" se movieron a la fila 75 (tel-fix 8): eso es lo que compra Silva.'
   where id = 133;

  select id into v_fix10 from public.stock_materiales where lower(nombre) = lower('Tornillo fix N°10 x 1 3/4" (p/ tarugo 8)');
  if v_fix10 is null then
    insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
    values ('Tornillo fix N°10 x 1 3/4" (p/ tarugo 8)', 'unid', 61.06, 6,
            array['tornillo fix 10','tel-fix 10','telfix 10','tornillo del 10','tornillos del 10','tornillo n10','tornillo para taco del 8','tornillo tel-fix 10 x 1 3/4'],
            'material', 'Alta 2026-09-05 desde factura Silva 0025-00026056: TEL-FIX 10 x 1 3/4" común 8, caja x100 $5.046,28 neto → $61,06 c/u. Es el tornillo que va con el taco del 8.')
    returning id into v_fix10;
  end if;

  update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || 'Silva 05/09/2026 (Garita): ' || v.n
  from (values
    (73,  3588.75,  'solera 35 $2.965,91 neto.'),
    (71,  4116.55,  'montante 35 $3.402,11 neto.'),
    (76,  27.67,    'T1 aguja caja x100 $2.286,78 neto → $27,67 c/u.'),
    (137, 25.77,    'tacos comunes N°6 c/tope caja x100 $2.129,75 neto → $25,77 c/u.'),
    (138, 49.66,    'tacos comunes N°8 c/tope caja x100 $4.104,13 neto → $49,66 c/u.'),
    (80,  50681.12, 'masilla LPU multiuso x 32 kg $41.885,22 neto.'),
    (79,  5127.18,  'cinta fibra autoadhesiva 48 mm x 90 m $4.237,34 neto.')
  ) as v(id, p, n)
  where stock_materiales.id = v.id;
  update public.stock_materiales set alias = array(select distinct unnest(alias || array['tacos del 6','tacos comunes n6','taco comun 6','tacos n6 con tope','tarugo 6','tarugos del 6'])) where id = 137;
  update public.stock_materiales set alias = array(select distinct unnest(alias || array['tacos del 8','tacos comunes n8','taco comun 8','tacos n8 con tope','tarugo 8','tarugos del 8'])) where id = 138;

  -- 2) corregir los dos vínculos del pedido (antes de comprar, así el renglón
  --    de la cuenta nace con el nombre correcto) ─────────────────────────────
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
  values (3366, 676, 'correccion', null, 'pendiente', 50, '"tacos del 6" son tarugos sueltos (tacos comunes N°6 c/tope, factura Silva), no el kit con tornillo → Tarugo nylon 6mm',
          jsonb_build_object('motivo', 'CC-025 Garita factura Silva 2026-09-05', 'material_anterior', 382, 'material_id', 137)),
         (3367, 676, 'correccion', null, 'pendiente', 50, '"tornillo del 8" es el TEL-FIX 8 x 1 1/2" común 6 (factura Silva), no el tornillo de madera 4x40 → Tornillo fix N°8',
          jsonb_build_object('motivo', 'CC-025 Garita factura Silva 2026-09-05', 'material_anterior', 133, 'material_id', 75));
  update public.solicitud_compra_item set material_id = 137, descripcion = 'Tarugo nylon 6mm' where id = 3366 and estado = 'pendiente';
  update public.solicitud_compra_item set material_id = 75, descripcion = 'Tornillo fix N°8 x 1 1/2" (p/ tarugo 6)' where id = 3367 and estado = 'pendiente';

  -- 3) los dos renglones que la factura trae y el pedido no tenía ──────────────
  insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
  values (676, 'Tarugo nylon 8mm', 100, 'unid', 'Vino en la factura Silva 0025-00026056 (05/09/2026) sin estar en el pedido', 'material', false, 'pendiente', 138)
  returning id into v_it8;
  insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
  values (676, 'Tornillo fix N°10 x 1 3/4" (p/ tarugo 8)', 100, 'unid', 'Vino en la factura Silva 0025-00026056 (05/09/2026) sin estar en el pedido', 'material', false, 'pendiente', v_fix10)
  returning id into v_it10;
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, comentario, user_id)
  values (v_it8,  676, 'creado', 'pendiente', 100, 'Agregado desde la factura Silva 0025-00026056', v_user),
         (v_it10, 676, 'creado', 'pendiente', 100, 'Agregado desde la factura Silva 0025-00026056', v_user);

  -- 4) la factura ──────────────────────────────────────────────────────────────
  select id into v_fact from public.facturas_compra where proveedor_id = 4 and numero = '25-26056';
  if v_fact is null then
    insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
    values (4, '25-26056', '2026-09-05', 557945.33,
            'Factura A 0025-00026056 · Durlock/Barbieri p/ Garita (pedido #676) · neto $451.777,60 + IVA 21 % $94.873,29 + percepciones IIBB Tuc. y TEM $11.294,44 · cuenta corriente. Cargada por SQL (20260905i), sin adjunto.',
            v_user, v_user)
    returning id into v_fact;
  end if;

  -- 5) comprar (RPC real: ítem → comprado, renglón de la cuenta, evento) ───────
  perform * from public.resolver_item_compra(3361, 4, 3588.75,  v_fact, v_user, 'cadinc', 12);
  perform * from public.resolver_item_compra(3362, 4, 4116.55,  v_fact, v_user, 'cadinc', 50);
  perform * from public.resolver_item_compra(3363, 4, 19997.00, v_fact, v_user, 'cadinc', 10);
  perform * from public.resolver_item_compra(3364, 4, 27.67,    v_fact, v_user, 'cadinc', 100);
  perform * from public.resolver_item_compra(3365, 4, 18.07,    v_fact, v_user, 'cadinc', 1000);
  perform * from public.resolver_item_compra(3366, 4, 25.77,    v_fact, v_user, 'cadinc', 100);
  perform * from public.resolver_item_compra(3367, 4, 41.62,    v_fact, v_user, 'cadinc', 100);
  perform * from public.resolver_item_compra(3368, 4, 50681.12, v_fact, v_user, 'cadinc', 1);
  perform * from public.resolver_item_compra(3369, 4, 5127.18,  v_fact, v_user, 'cadinc', 1);
  perform * from public.resolver_item_compra(3370, 4, 1668.00,  v_fact, v_user, 'cadinc', 2);
  perform * from public.resolver_item_compra(v_it8,  4, 49.66,  v_fact, v_user, 'cadinc', 100);
  perform * from public.resolver_item_compra(v_it10, 4, 61.06,  v_fact, v_user, 'cadinc', 100);

  raise notice 'factura #% · renglones nuevos % y %', v_fact, v_it8, v_it10;
end $$;
