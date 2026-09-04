-- 20260904bj — Compra directa de Adicem a Oficina Misión Salta (CC-022): 40 bolsas de Adesilex P9
--
-- Factura A 0006-00011612 de Adicem (Scopel Sergio Rafael) del 04/09/2026,
-- código MP3 "PEGAMENTO PORCELANATO 25KG ADESILEX P9 GRIS": 40 unidades a
-- $18.891,62 neto → $22.858,86 final (× 1,21). Neto $755.664,80 + IVA 21 %
-- $158.689,61 = $914.354,41 (acá 40 × 22.858,86 = $914.354,40: un centavo de
-- redondeo). Condición cuenta corriente.
--
-- Pedido del user (2026-09-04): "de proveedor directo a obra, pagada por
-- nosotros, ya llegó a obra". Se replica el flujo real del sistema para que la
-- trazabilidad quede igual que desde la pantalla:
--   1) alta en el catálogo (Adesilex P9 es Mapei, bolsa de 25 kg; la fila 323
--      "Pegamento p/ porcelanato x 30kg" es otro producto),
--   2) factura de compra (sin adjunto: la foto quedó en el chat),
--   3) pedido CC-022 con un renglón, evento 'creado',
--   4) compra vía RPC `resolver_item_compra` (proveedor Adicem #5, pagado_por
--      cadinc) → el renglón de la cuenta corriente nace solo; la obra es llave
--      en mano así que el trigger lo deja a_cargo_de = 'cadinc' (gasto CADINC),
--   5) envío directo sin remito (mismo shape que `enviarItem` del backend):
--      estado 'enviado', cantidad_enviada 40, evento 'enviado'.
-- Idempotente: si el pedido ya existe para esa factura, no hace nada.

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';   -- Franco Leiro (admin)
  v_mat  int;
  v_fact int;
  v_sol  int;
  v_item int;
begin
  -- 1) catálogo ──────────────────────────────────────────────────────────────
  select id into v_mat from public.stock_materiales
   where lower(nombre) = lower('Pegamento p/ porcelanato Adesilex P9 gris x 25kg');
  if v_mat is null then
    insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
    values ('Pegamento p/ porcelanato Adesilex P9 gris x 25kg', 'bolsa', 22858.86, 4,
            array['adesilex p9','adesilex','pegamento adesilex','pegamento porcelanato mapei','pegamento porcelanato 25kg',
                  'pegamento porcelanato 25 kg','pegamento porcelanato gris','mp3 adesilex','adhesivo porcelanato mapei'],
            'material',
            'Alta 2026-09-04 desde factura Adicem A 0006-00011612 04/09/2026: $18.891,62 neto la bolsa de 25 kg (Mapei). Precio final.')
    returning id into v_mat;
  end if;

  -- 2) factura ───────────────────────────────────────────────────────────────
  select id into v_fact from public.facturas_compra where proveedor_id = 5 and numero = '6-11612';
  if v_fact is null then
    insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
    values (5, '6-11612', '2026-09-04', 914354.41,
            'Factura A 0006-00011612 · MP3 Adesilex P9 gris 25 kg × 40 · neto $755.664,80 + IVA 21 % $158.689,61 · cuenta corriente. Cargada por SQL (20260904bj), sin adjunto.',
            v_user, v_user)
    returning id into v_fact;
  end if;

  -- guard de idempotencia
  if exists (select 1 from public.solicitud_compra_item where factura_id = v_fact) then
    raise notice 'Ya existe un renglón con la factura %, no se carga de nuevo', v_fact;
    return;
  end if;

  -- 3) pedido ────────────────────────────────────────────────────────────────
  insert into public.solicitud_compra (obra_cod, solicitante, fecha, estado, prioridad, obs, aprobado_por, created_by, updated_by)
  values ('CC-022', v_user, '2026-09-04', 'aprobada', 'normal',
          'Compra directa de Adicem a la obra (factura A 0006-00011612 del 04/09/2026), pagada por CADINC. Cargada el 2026-09-04 ya recibida en obra.',
          v_user, v_user, v_user)
  returning id into v_sol;

  insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
  values (v_sol, 'Pegamento p/ porcelanato Adesilex P9 gris x 25kg', 40, 'bolsa',
          'Factura Adicem A 0006-00011612 04/09/2026', 'material', false, 'pendiente', v_mat)
  returning id into v_item;

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, user_id)
  values (v_item, v_sol, 'creado', 'pendiente', 40, v_user);

  -- 4) compra (RPC real: setea el ítem, inserta el renglón de la cuenta y el evento 'comprado')
  perform * from public.resolver_item_compra(v_item, 5, 22858.86, v_fact, v_user, 'cadinc', null);

  -- 5) envío directo del proveedor a la obra (sin remito de CADINC) ───────────
  update public.solicitud_compra_item
     set estado = 'enviado', fecha_envio = '2026-09-04', cantidad_enviada = 40,
         fecha_resolucion = '2026-09-04', updated_by = v_user
   where id = v_item;
  update public.materiales_a_cuenta_cliente
     set fecha_resolucion = '2026-09-04', updated_at = now()
   where item_id = v_item;

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values (v_item, v_sol, 'enviado', 'comprado', 'enviado', 40,
          'Entrega directa del proveedor en la obra (04/09/2026), sin remito de CADINC',
          jsonb_build_object('fecha_envio', '2026-09-04', 'entrega_directa_proveedor', true, 'factura_id', v_fact),
          v_user);

  raise notice 'pedido #% · ítem #% · factura #% · material #%', v_sol, v_item, v_fact, v_mat;
end $$;
