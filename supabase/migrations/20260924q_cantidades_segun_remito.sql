-- =====================================================================
-- Cantidades de la cuenta alineadas con el remito (2026-09-24)
--
-- Tanda 3 de la revisión de Pedidos y Stock (A1 y A2). En estos renglones la
-- cantidad de la cuenta del cliente (y del pedido) no coincidía con lo que
-- dice el remito. En todos, alguien la cambió a mano sin dejar evento (o la
-- vinculación manual del 05/09 tomó la cantidad pedida y no la comprada). El
-- dueño decidió el 24/09: vale el REMITO.
--
--   mcc  item  obra              qué                         cuenta → remito
--   1711 1855  CLINICA HERAS     caño corrugado 3/4" (m)          2 → 50
--   1772 1921  CC-016 (cobro 12) tornillo madera 6x127          800 → 50
--   1118 1231  CC-016 (cobro 11) ladrillo hueco 12              288 → 270
--   3310 3534  CC-017            alfombra (m2, CADINC)            17 → 6
--   2189 2336  CC-013            tirante 3x3 (consumible)        150 → 1
--     69   97  PRADERAS          revoque fino (pagó cliente)       7 → 25
--   1272 1091  PRADERAS          tarugo fisher (pagó cliente)     50 → 100
--   1718 1846  CC-019            artefacto estanco (CADINC)        2 → 3
--   1715 1914  CC-019            marco panel LED (CADINC)          1 → 3
--
-- Los dos cobrados (1772, 1118) van en los tres pasos de §5.14: soltar del
-- cobro, corregir y volver a colgar del MISMO cobro con el monto nuevo. Al
-- cliente se le cobraron $160.642 de más: esa plata queda libre en los
-- cobros 11 y 12 y se aplica con «Imputar lo pagado» en CC-016.
--
-- A2: el esmalte negro (ficha 703) figura con 0,5 lata que no existe. Su
-- despacho del 10/09 (item 3651) no descontó stock y la devolución del 16/09
-- sí sumó. Se carga la salida que faltaba. Los otros 6 despachos sin salida
-- no se tocan (decisión del dueño): sus fichas nacieron en 0 después del
-- despacho y la salida solo las dejaría en negativo.
-- =====================================================================

do $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select * from (values
      (1711, 1855, 50::numeric,  null::int),
      (1772, 1921, 50,           12),
      (1118, 1231, 270,          11),
      (3310, 3534, 6,            null),
      (2189, 2336, 1,            null),
      (  69,   97, 25,           null),
      (1272, 1091, 100,          null),
      (1718, 1846, 3,            null),
      (1715, 1914, 3,            null)
    ) as t(mcc_id, item_id, cant, cobro)
  loop
    -- Cada fila tiene que estar como se la vio el 24/09: si alguien la tocó
    -- mientras tanto, no se pisa.
    perform 1 from materiales_a_cuenta_cliente
      where id = r.mcc_id and item_id = r.item_id and cobro_id is not distinct from r.cobro
        and certificado_id is null;
    if not found then raise exception 'mcc % cambió desde la revisión', r.mcc_id; end if;

    if r.cobro is not null then
      update materiales_a_cuenta_cliente set cobro_id = null, monto_cobrado = null where id = r.mcc_id;
    end if;

    update materiales_a_cuenta_cliente
       set cantidad = r.cant, precio_total = round(r.cant * precio_unit, 2), updated_at = now()
     where id = r.mcc_id;

    if r.cobro is not null then
      update materiales_a_cuenta_cliente set cobro_id = r.cobro, monto_cobrado = precio_total where id = r.mcc_id;
    end if;

    update solicitud_compra_item set cantidad = r.cant where id = r.item_id;

    insert into solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
    select r.item_id, i.solicitud_id, 'correccion', i.estado, i.estado, r.cant,
           'Cantidad alineada con el remito (revisión 23/09, decisión del dueño 24/09)',
           jsonb_build_object('mcc_id', r.mcc_id, 'cobro_id', r.cobro, 'migracion', '20260924q')
      from solicitud_compra_item i where i.id = r.item_id;
    v_n := v_n + 1;
  end loop;

  -- A2: la salida que le faltó al despacho del esmalte negro.
  perform 1 from stock_movimientos where solicitud_item_id = 3651 and tipo = 'salida';
  if found then raise exception 'el item 3651 ya tiene salida'; end if;
  insert into stock_movimientos (material_id, tipo, cantidad, motivo, obra_cod, solicitud_item_id, obs, fecha, estado)
  values (703, 'salida', 0.5, 'despacho_obra', 'CC-025', 3651,
          'Salida que faltó al despacho del 10/09 (la devolución del 16/09 sí sumó): revisión 23/09',
          current_date, 'aprobado');
  update stock_materiales set stock_actual = stock_actual - 0.5, updated_at = now() where id = 703;
end $$;
