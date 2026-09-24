-- =====================================================================
-- Unidades mal cargadas y el costo de la Garita (2026-09-24)
--
-- Tanda 3 de la revisión de Pedidos y Stock (A5 y B2). Decisiones del dueño
-- del 24/09:
--
-- 1. Sika Látex de CC-005 (mcc 2244): se entregaron 10 LITROS (2,5 latas),
--    pero el precio por litro era el de la lata ($20.600). Pasa al precio por
--    litro del catálogo: la lata de 4 lt a $26.620 → $6.655/lt. Son
--    $206.000 → $66.550; se cobraban $139.450 de más.
--
-- 2. Yeso, masilla Durlock y enduido cargados en «kg» con precio de bolsa o
--    balde: eran BOLSAS y BALDES enteros. La cantidad no cambia; cambia la
--    unidad, y se tasan al precio del catálogo (aprobado explícitamente: la
--    regla de §5.14 es no retasar la cuenta sin el OK del dueño).
--
-- 3. GARITA (CC-025): 13 renglones de sus pedidos quedaron en la cuenta de
--    Hipódromo (CC-019, archivada) porque el remito salió a CC-019. La garita
--    está en el hipódromo, pero CC-019 es otra obra con el mismo nombre de
--    lugar. Las dos son llave en mano: no cambia quién paga, solo en qué
--    obra queda el costo ($551.598).
--
-- Los ~20 renglones restantes con la unidad distinta de la ficha tienen la
-- plata bien y quedan como están (decisión del dueño).
-- =====================================================================

do $$
declare
  r record;
  v_n int;
begin
  -- 1 y 2: precio (y unidad) de cada renglón. Ninguno cobrado ni certificado.
  for r in
    select * from (values
      (2244, 2395, null::text, 6655.00::numeric),   -- Sika: 10 lt a $/lt
      ( 324,  415, 'bolsa',   14400.00),            -- yeso ×5
      ( 298,  390, 'bolsa',   14400.00),            -- yeso ×3
      ( 469,  546, 'bolsa',   14400.00),            -- yeso ×1
      ( 112,  195, 'balde',   50681.12),            -- masilla Durlock ×2
      (2867, 3052, 'balde',   62695.00),            -- enduido ×1
      (2592, 2750, 'balde',   62695.00)             -- enduido ×1
    ) as t(mcc_id, item_id, unidad, precio)
  loop
    perform 1 from materiales_a_cuenta_cliente
      where id = r.mcc_id and item_id = r.item_id and cobro_id is null and certificado_id is null;
    if not found then raise exception 'mcc % cambió o está congelado', r.mcc_id; end if;

    update materiales_a_cuenta_cliente
       set unidad = coalesce(r.unidad, unidad), precio_unit = r.precio,
           precio_total = round(cantidad * r.precio, 2), updated_at = now()
     where id = r.mcc_id;
    update solicitud_compra_item
       set unidad = coalesce(r.unidad, unidad), precio_unit = r.precio
     where id = r.item_id;

    insert into solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
    select r.item_id, i.solicitud_id, 'correccion', i.estado, i.estado,
           case when r.unidad is null then 'Precio por litro (se había cargado el de la lata)'
                else 'Era ' || r.unidad || ' entera, no kg: unidad y precio de catálogo' end
             || ' — revisión 23/09, decisión del dueño 24/09',
           jsonb_build_object('mcc_id', r.mcc_id, 'unidad', r.unidad, 'precio', r.precio, 'migracion', '20260924r')
      from solicitud_compra_item i where i.id = r.item_id;
  end loop;

  -- 3: el costo de la Garita vuelve a la Garita.
  update materiales_a_cuenta_cliente c
     set obra_cod = 'CC-025', updated_at = now()
    from solicitud_compra s
   where s.id = c.solicitud_id and s.obra_cod = 'CC-025' and c.obra_cod = 'CC-019'
     and c.cobro_id is null and c.certificado_id is null;
  get diagnostics v_n = row_count;
  if v_n <> 13 then raise exception 'Garita: esperaba 13 renglones, son %', v_n; end if;
end $$;
