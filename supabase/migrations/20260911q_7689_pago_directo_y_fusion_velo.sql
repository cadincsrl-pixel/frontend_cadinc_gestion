-- 20260911q — Dos cosas del user (08/09):
--
-- 1. "pintura latex cod 7689" (ficha 946): es una pintura EXTERIOR con ese
--    codigo SW y la PAGO EL CLIENTE. Sus dos renglones de CC CADINC 1 (25 lt y
--    20 lt) pasan a pagado_por = 'cliente' (pago directo: se rinde, no es
--    deuda). La ficha deja de ser chatarra: nombre con producto y codigo,
--    unidad lata, y el precio roto ($13,31, "cargado en miles") a 0.
--
-- 2. Fusion: la 686 (Sika Tex 75, 3 renglones) es el mismo producto que la
--    906 "Velo de fibra p/ refuerzo de membrana" (rollo, $33.520, 8 renglones).
--    Todo lo que apuntaba a 686 pasa a 906 (por las FK, dinamicamente, salvo
--    el historial de precios que se queda con su ficha), 906 se lleva el
--    nombre con las medidas y los alias, 686 queda de baja con la nota.

-- ── 1. cod 7689 ──
update public.stock_materiales
   set nombre = 'Látex exterior SW 7689 x 20lts',
       unidad = 'lata',
       precio_ref = 0,
       alias = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || array['sw 7689', '7689', 'sw7689', 'latex exterior 7689']) a),
       obs = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: es un latex EXTERIOR con codigo SW 7689 (user); nombre en minuscula y $13,31 eran chatarra del alta rapida. Sin precio: se carga con la primera compra. Producto y nombre del color por confirmar.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 946;

update public.materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id in (3099, 3122) and cobro_id is null and certificado_id is null;
update public.solicitud_compra_item set pagado_por = 'cliente' where id in (3303, 3330);

-- ── 2. fusion 686 -> 906 ──
do $$
declare r record; v_n integer;
begin
  for r in
    select c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.stock_materiales'::regclass
       and c.conrelid <> 'public.stock_materiales_precios'::regclass
  loop
    execute format('update %s set %I = 906 where %I = 686', r.tabla, r.columna, r.columna);
    get diagnostics v_n = row_count;
    if v_n > 0 then raise notice 'fusion 686->906: % filas en %.%', v_n, r.tabla, r.columna; end if;
  end loop;
end $$;

update public.stock_materiales
   set nombre = 'Velo de fibra Sika Tex 75 p/ refuerzo de membrana x rollo (1,05 × 25 m = 26 m²)',
       alias  = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || (select coalesce(alias,'{}') from public.stock_materiales where id = 686)
                                                          || array['geotextil', 'geotextil no tejido', 'sika tex', 'sikatex', 'sika tex 75', 'manta sika tex', 'velo para membrana']) a),
       stock_actual = stock_actual + (select coalesce(stock_actual, 0) from public.stock_materiales where id = 686),
       obs = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: absorbe la ficha 686 "Geotextil no tejido 200g/m2" (mismo producto: Sika Tex 75, rollo 1,05 x 25 m). Sus renglones y movimientos pasaron aca.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 906;

update public.stock_materiales
   set activo = false, stock_actual = 0,
       obs = trim(both ' ' from coalesce(obs,'') || ' · Baja 08/09/2026: fusionada en la 906 (Velo de fibra Sika Tex 75). Nada apunta aca.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 686;
