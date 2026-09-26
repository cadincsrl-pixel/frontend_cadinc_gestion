-- =====================================================================
-- 20261009c — CARNICER MICHAEL DANIEL (CUIT 20-92421139-4): alimentos,
-- pagado con Caja (2026-09-26, dueño: «20924211394 es alimentos pagado con
-- caja»)
--
-- Carnicería. Tenía 18 facturas, ninguna bien clasificada:
--   · 10 históricas (abr–jun) «a reconstruir», sin imputar;
--   · 5 de julio imputadas como «Materiales de obra» → CC CADINC, en deuda;
--   · 3 de ago–sep sin imputar (2 ya pagadas en efectivo desde Caja).
--
-- 1. Concepto nuevo «Alimentos» (no había ninguno equivalente). Sin mapeo
--    contable todavía: lo carga el contador (compras.concepto).
-- 2. Tributos «otros según ARCA (sin clasificar)» de 13 facturas → costo
--    (tipo otro, con leyenda), igual que Sancor: así se pueden imputar.
-- 3. Todas → Alimentos, CC CADINC (donde ya estaban las de julio).
-- 4. Pagadas en efectivo desde Caja (tesorería 3), fecha de cada factura:
--    las «a reconstruir» con pagos_reconstruir_orden; las que estaban en
--    deuda se aprueban y se paga con _pagos_emitir_orden (como 20260930z).
-- 5. Ficha: forma habitual efectivo, concepto Alimentos, obra CC CADINC.
-- =====================================================================
do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_prov bigint := 63;
  v_con  bigint;
  f      record;
  v_desg jsonb;
begin
  if (select cuit from pagos_proveedores where id = v_prov) <> '20924211394' then
    raise exception 'PROVEEDOR_EQUIVOCADO';
  end if;

  -- 1. Concepto
  select id into v_con from pagos_conceptos where nombre = 'Alimentos';
  if v_con is null then
    insert into pagos_conceptos (nombre, orden, created_by, updated_by)
    values ('Alimentos', (select coalesce(max(orden), 0) + 1 from pagos_conceptos), v_user, v_user)
    returning id into v_con;
  end if;

  -- 2. Tributos sin clasificar → costo
  for f in select * from pagos_facturas where proveedor_id = v_prov and estado <> 'anulada' and tributos_a_revisar loop
    v_desg := jsonb_build_object(
      'iva_detalle', coalesce((select jsonb_agg(jsonb_build_object('alicuota_id', i.alicuota_id, 'base_imp', i.base_imp, 'importe', i.importe))
                                 from pagos_factura_iva i where i.factura_id = f.id), '[]'::jsonb),
      'tributos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'importe', t.importe, 'jurisdiccion', t.jurisdiccion,
                                   'descripcion', case when t.tipo = 'otro' then 'Otros tributos según ARCA (costo)' else t.descripcion end))
                              from pagos_factura_tributos t where t.factura_id = f.id), '[]'::jsonb),
      'no_gravado', coalesce(f.no_gravado, 0), 'exento', coalesce(f.exento, 0));
    perform pagos_completar_desglose(f.id, v_desg, v_user, false);
  end loop;

  -- 3. Imputar las sin imputar y reclasificar las de julio
  for f in select v.id, v.imputable from v_pagos_facturas v where v.proveedor_id = v_prov and v.estado <> 'anulada' and v.sin_imputar loop
    perform pagos_imputar_factura(f.id, v_con, jsonb_build_array(jsonb_build_object('obra_cod', 'CC CADINC', 'monto', f.imputable)), 'Alimentos (carnicería)', v_user);
  end loop;
  update pagos_facturas set concepto_id = v_con, updated_by = v_user
   where proveedor_id = v_prov and estado <> 'anulada' and concepto_id is distinct from v_con;

  -- 4a. «A reconstruir»: una OP en efectivo por factura
  for f in select v.id, v.fecha, v.numero, v.saldo from v_pagos_facturas v
            where v.proveedor_id = v_prov and v.estado <> 'anulada' and v.clase = 'factura' and v.pago_a_reconstruir and v.saldo > 0.005
            order by v.fecha, v.id loop
    perform pagos_reconstruir_orden(v_prov,
      jsonb_build_object('fecha', f.fecha, 'forma_pago', 'efectivo', 'cuenta_origen_id', 3, 'monto_pagado', f.saldo,
        'referencia', 'Pagada en efectivo desde Caja (dueño, 26/09) · ' || f.numero,
        'obs', 'Pago reconstruido el 26/09. 20261009c.'),
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', f.id, 'monto', f.saldo)), v_user);
  end loop;

  -- 4b. Las que estaban en deuda: aprobar y pagar en efectivo desde Caja
  perform pagos_aprobar_facturas(
    (select array_agg(id) from v_pagos_facturas
      where proveedor_id = v_prov and estado = 'pendiente' and clase = 'factura' and not pago_a_reconstruir and saldo > 0.005), v_user);
  perform set_config('cadinc.pagos_reconstruir', 'on', true);
  for f in select v.id, v.fecha, v.numero, v.saldo from v_pagos_facturas v
            where v.proveedor_id = v_prov and v.estado in ('aprobada', 'pagada_parcial') and v.clase = 'factura' and v.saldo > 0.005
            order by v.fecha, v.id loop
    perform _pagos_emitir_orden(v_prov,
      jsonb_build_object('fecha', f.fecha, 'forma_pago', 'efectivo', 'cuenta_origen_id', 3, 'monto_pagado', f.saldo,
        'referencia', 'Pagada en efectivo desde Caja (dueño, 26/09) · ' || f.numero,
        'obs', 'Registrada el 26/09: la carnicería se paga en el momento. 20261009c.'),
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', f.id, 'monto', f.saldo)), '[]'::jsonb, v_user, false);
  end loop;
  perform set_config('cadinc.pagos_reconstruir', 'off', true);

  -- 5. Ficha
  update pagos_proveedores
     set forma_pago_habitual = 'efectivo', concepto_habitual_id = v_con, obra_habitual_cod = 'CC CADINC', updated_by = v_user
   where id = v_prov;
end $m$;
