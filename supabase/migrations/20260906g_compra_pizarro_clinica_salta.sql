-- 20260906g — Compra directa de Pizarro Refrigeración a Clínica Salta (CC CLINICA SALTA): materiales de aire acondicionado
--
-- Factura A 0012-00007497 de PIZARRO REFRIGERACION S.R.L. (CUIT 30-71516576-3)
-- del 31/08/2026, cuenta corriente: neto $102.641,44 + IVA 21 % $21.554,70 =
-- $124.196,14 (sin percepciones). Pagada por CADINC, entregada en obra el
-- mismo día (user 2026-09-06). Obra a cargo del cliente → los renglones nacen
-- a cobrar. Mismo flujo que 20260904bj: pedido + RPC resolver_item_compra +
-- envío directo.
--
-- El cobre viene por kilo y la factura trae la conversión: 1/4" 0,123 kg/m y
-- 1/2" 0,273 kg/m. El catálogo va por metro:
--   1/4": 0,40 kg = 3,252 m · $43.978,14/kg × 0,123 = $5.409,31/m neto → $6.545,27 final
--   1/2": 1,15 kg = 4,212 m · $43.978,14/kg × 0,273 = $12.006,03/m neto → $14.527,30 final
-- Altas: termotubo 1/2" (había 1/4, 3/8, 5/8 y 3/4) y cable tipo taller 4x1,5.

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_prov int; v_fact int; v_sol int; v_item int; v_mat int;
  r record;
begin
  -- proveedor ────────────────────────────────────────────────────────────────
  select id into v_prov from public.proveedores where cuit = '30715165763' or public.norm_txt(nombre) like '%pizarro%';
  if v_prov is null then
    insert into public.proveedores (nombre, cuit, tel, email, activo, obs, created_by, updated_by)
    values ('PIZARRO REFRIGERACION', '30715165763', '0381-4233651', 'info@pizarroclimatizacion.com', true,
            'Pizarro Climatización, Av. Mitre 432, S. M. de Tucumán. Alta 2026-09-06 desde la factura A 0012-00007497.', v_user, v_user)
    returning id into v_prov;
  end if;

  -- altas de catálogo ────────────────────────────────────────────────────────
  insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
  select 'Aislante térmico p/ caño 1/2" (termotubo 6mm, tira 1.8m)', 'unid', 1767.66, 8,
         array['aislante 1/2','termotubo 1/2','aislacion termotubo 1/2','aislante cobre 1/2','aislacion 1/2','aislante de cano 1/2'], 'material',
         'Alta 2026-09-06 desde factura Pizarro A 0012-00007497 31/08/2026: $1.460,88 neto la tira. Precio final.'
  where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Aislante térmico p/ caño 1/2" (termotubo 6mm, tira 1.8m)'));
  insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
  select 'Cable tipo taller 4x1.5mm²', 'm', 2923.05, 2,
         array['cable taller 4x1.5','cable tipo taller 4 x 1.5','cable taller 4x1,5','cable 4x1.5','cable taller cuadruple 1.5','cable taller 4 hilos'], 'material',
         'Alta 2026-09-06 desde factura Pizarro A 0012-00007497 31/08/2026: $2.415,74 neto el metro. Precio final.'
  where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Cable tipo taller 4x1.5mm²'));

  -- precios de referencia (última compra) ────────────────────────────────────
  update public.stock_materiales set precio_ref = 6545.27,  precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'POR METRO. Pizarro 31/08/2026: $43.978,14/kg neto × 0,123 kg/m = $5.409,31/m neto.' where id = 885;
  update public.stock_materiales set precio_ref = 14527.30, precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'POR METRO. Pizarro 31/08/2026: $43.978,14/kg neto × 0,273 kg/m = $12.006,03/m neto.' where id = 1025;
  update public.stock_materiales set precio_ref = 940.86,   precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'Pizarro 31/08/2026: $777,57 neto la tira.' where id = 1010;
  update public.stock_materiales set precio_ref = 17342.87, precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'Pizarro 31/08/2026: brazo 52 cm el par $14.332,95 neto.' where id = 1017;
  update public.stock_materiales set precio_ref = 2286.55,  precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'Pizarro 31/08/2026: cinta enfasolar 72 mm x 20 m $1.889,71 neto.' where id = 1009;
  update public.stock_materiales set precio_ref = 1328.88,  precio_actualizado_en = now(), obs = coalesce(obs || ' · ', '') || 'POR METRO. Pizarro 31/08/2026: manguera cristal 5/8 (16x20) $1.098,25 neto.' where id = 1033;

  -- factura ──────────────────────────────────────────────────────────────────
  select id into v_fact from public.facturas_compra where proveedor_id = v_prov and numero = '12-7497';
  if v_fact is null then
    insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
    values (v_prov, '12-7497', '2026-08-31', 124196.14,
            'Factura A 0012-00007497 · materiales de aire acondicionado p/ Clínica Salta · neto $102.641,44 + IVA 21 % $21.554,70 · cuenta corriente. Cargada por SQL (20260906g), la foto quedó en el chat.',
            v_user, v_user)
    returning id into v_fact;
  end if;
  if exists (select 1 from public.solicitud_compra_item where factura_id = v_fact) then
    raise notice 'Ya existe un renglón con la factura %, no se carga de nuevo', v_fact;
    return;
  end if;

  -- pedido ───────────────────────────────────────────────────────────────────
  insert into public.solicitud_compra (obra_cod, solicitante, fecha, estado, prioridad, obs, aprobado_por, created_by, updated_by)
  values ('CC CLINICA SALTA', v_user, '2026-08-31', 'aprobada', 'normal',
          'Compra directa de Pizarro Refrigeración a la obra (factura A 0012-00007497 del 31/08/2026), pagada por CADINC, entregada el 31/08. Cargada el 2026-09-06.',
          v_user, v_user, v_user)
  returning id into v_sol;

  for r in
    select * from (values
      ('Caño de cobre 1/4"',                                        3.252::numeric, 'm',    6545.27::numeric),
      ('Caño de cobre 1/2"',                                        4.212,          'm',    14527.30),
      ('Aislante térmico p/ caño 1/2" (termotubo 6mm, tira 1.8m)',  2,              'unid', 1767.66),
      ('Aislante térmico p/ caño 1/4" (termotubo 6mm, tira 1.8m)',  2,              'unid', 940.86),
      ('Ménsula p/ aire acondicionado 52cm (par)',                  1,              'unid', 17342.87),
      ('Cable tipo taller 4x1.5mm²',                                4,              'm',    2923.05),
      ('Cinta PVC p/ aislación de caños 72mm x 20m',                1,              'unid', 2286.55),
      ('Manguera cristal 5/8" (16x20)',                             2,              'm',    1328.88),
      ('Cinta aisladora',                                           1,              'unid', 2318.74)
    ) as t(nombre, cant, unidad, precio)
  loop
    select id into v_mat from public.stock_materiales where lower(nombre) = lower(r.nombre) and activo limit 1;
    if v_mat is null then raise exception 'No existe en el catálogo: %', r.nombre; end if;

    insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
    values (v_sol, r.nombre, r.cant, r.unidad, 'Factura Pizarro A 0012-00007497 31/08/2026', 'material', false, 'pendiente', v_mat)
    returning id into v_item;
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, user_id)
    values (v_item, v_sol, 'creado', 'pendiente', r.cant, v_user);

    perform * from public.resolver_item_compra(v_item, v_prov, r.precio, v_fact, v_user, 'cadinc', null);

    update public.solicitud_compra_item
       set estado = 'enviado', fecha_envio = '2026-08-31', cantidad_enviada = r.cant, fecha_resolucion = '2026-08-31', updated_by = v_user
     where id = v_item;
    update public.materiales_a_cuenta_cliente set fecha_resolucion = '2026-08-31', updated_at = now() where item_id = v_item;
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
    values (v_item, v_sol, 'enviado', 'comprado', 'enviado', r.cant,
            'Entrega directa del proveedor en la obra (31/08/2026), sin remito de CADINC',
            jsonb_build_object('fecha_envio', '2026-08-31', 'entrega_directa_proveedor', true, 'factura_id', v_fact), v_user);
  end loop;

  raise notice 'pedido #% · factura #% · proveedor #%', v_sol, v_fact, v_prov;
end $$;
