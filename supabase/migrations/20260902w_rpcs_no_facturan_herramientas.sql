-- Cierra los DOS caminos a materiales_a_cuenta_cliente que el corte en
-- _registrarMaterialCliente NO cubre, porque no pasan por ahí.
--
-- Lo encontró la revisión adversarial del cambio de `clase` (20260902u). El
-- comentario original del service decía que _registrarMaterialCliente era "el único
-- camino vivo a MCC en prod". Era FALSO:
--
--   1) retirar_de_proveedor escribe MCC directo y NO está detrás de USE_RPC_RESOLVER
--      (stock-proveedor.service.ts la llama siempre). Repro: línea herramienta →
--      Comprar con "queda en proveedor" → retirar con remito → fila en MCC → facturada.
--      Fix: `clase` entra al RECORD y el guard exige clase <> 'herramienta'.
--
--   2) comprar_faltante_item crea el renglón del faltante sin copiar clase/devuelve/
--      color: nacía 'material'. Repro: despacho parcial de una herramienta → "Comprar
--      faltante" → el nuevo se compra como material → MCC → facturado.
--      Fix: el INSERT hereda clase, devuelve y color del original.
--
-- ⚠ resolver_item_compra / resolver_item_despacho también insertan en MCC sin mirar
-- clase, pero están DORMIDAS (USE_RPC_RESOLVER=false). Mina anotada: si alguien
-- prende el flag por env var, la fuga vuelve sin redeploy.

-- (cuerpos completos abajo, idénticos a lo aplicado en prod el 2026-09-02)

-- ── 1. retirar_de_proveedor: guard por clase ────────────────────────────────
CREATE OR REPLACE FUNCTION public.retirar_de_proveedor(p_proveedor_id integer, p_obra_cod text, p_fecha date, p_comprobante_url text, p_comprobante_hash text, p_obs text, p_items jsonb, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_remito_id integer;
  v_numero    text;
  v_seq       integer;
  v_item      RECORD;
  v_pendiente numeric;
  v_acum_retirada numeric;
  v_obra_es_dep boolean;
  v_input     jsonb;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'SIN_ITEMS' USING ERRCODE='P0001';
  END IF;

  SELECT es_deposito INTO v_obra_es_dep FROM obras WHERE cod = p_obra_cod;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '[^0-9]', '', 'g'), '')::integer), 0) + 1
  INTO v_seq
  FROM remitos_retiro_proveedor
  WHERE numero LIKE 'RR-%';
  v_numero := 'RR-' || lpad(v_seq::text, 4, '0');

  INSERT INTO remitos_retiro_proveedor
    (numero, proveedor_id, obra_cod, fecha, comprobante_url, comprobante_hash, obs, created_by, updated_by)
  VALUES
    (v_numero, p_proveedor_id, p_obra_cod, p_fecha, p_comprobante_url, p_comprobante_hash, p_obs, p_user_id, p_user_id)
  RETURNING id INTO v_remito_id;

  FOR v_input IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- `clase` entra al RECORD: es lo que decide si va o no a MCC
    SELECT id, solicitud_id, estado, proveedor_id, descripcion, unidad,
           cantidad, precio_unit, factura_id, pagado_por, clase
    INTO v_item
    FROM solicitud_compra_item
    WHERE id = (v_input->>'item_id')::integer
    FOR UPDATE;

    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'ITEM_NO_EXISTE' USING ERRCODE='P0001', DETAIL=(v_input->>'item_id');
    END IF;
    IF v_item.estado <> 'en_proveedor' THEN
      RAISE EXCEPTION 'ITEM_NO_EN_PROVEEDOR' USING ERRCODE='P0001', DETAIL=v_item.estado;
    END IF;
    IF v_item.proveedor_id <> p_proveedor_id THEN
      RAISE EXCEPTION 'ITEM_PROVEEDOR_DISTINTO' USING ERRCODE='P0001';
    END IF;

    SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN cantidad ELSE -cantidad END), 0)
    INTO v_pendiente
    FROM stock_proveedor_movimientos
    WHERE solicitud_item_id = v_item.id;

    IF (v_input->>'cantidad')::numeric > v_pendiente THEN
      RAISE EXCEPTION 'CANTIDAD_EXCEDE_PENDIENTE'
        USING ERRCODE='P0001',
              DETAIL=format('item %s pendiente=%s solicitado=%s', v_item.id, v_pendiente, v_input->>'cantidad');
    END IF;

    INSERT INTO remitos_retiro_proveedor_item
      (remito_id, solicitud_item_id, cantidad)
    VALUES
      (v_remito_id, v_item.id, (v_input->>'cantidad')::numeric);

    INSERT INTO stock_proveedor_movimientos
      (proveedor_id, solicitud_item_id, tipo, motivo, cantidad, remito_retiro_id, fecha, created_by)
    VALUES
      (p_proveedor_id, v_item.id, 'salida', 'retiro', (v_input->>'cantidad')::numeric, v_remito_id, p_fecha, p_user_id);

    IF (v_input->>'cantidad')::numeric >= v_pendiente THEN
      UPDATE solicitud_compra_item
      SET estado = 'retirado', updated_by = p_user_id
      WHERE id = v_item.id;
    END IF;

    -- Una HERRAMIENTA nunca se factura al cliente como material (activo de
    -- CADINC que va y vuelve). Mismo criterio que _registrarMaterialCliente.
    IF NOT COALESCE(v_obra_es_dep, false)
       AND COALESCE(v_item.clase, 'material') <> 'herramienta' THEN
      SELECT COALESCE(SUM(CASE WHEN tipo='salida' THEN cantidad ELSE 0 END), 0)
      INTO v_acum_retirada
      FROM stock_proveedor_movimientos
      WHERE solicitud_item_id = v_item.id;

      INSERT INTO materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id, fecha_resolucion,
         pagado_por, created_by, updated_by)
      VALUES
        (p_obra_cod, v_item.solicitud_id, v_item.id, v_item.descripcion, v_acum_retirada,
         v_item.unidad, v_item.precio_unit, v_acum_retirada * COALESCE(v_item.precio_unit, 0),
         'proveedor', p_proveedor_id, v_item.factura_id, p_fecha,
         COALESCE(v_item.pagado_por, 'cadinc'), p_user_id, p_user_id)
      ON CONFLICT (item_id) DO UPDATE
      SET cantidad         = EXCLUDED.cantidad,
          precio_total     = EXCLUDED.precio_total,
          fecha_resolucion = EXCLUDED.fecha_resolucion,
          pagado_por       = EXCLUDED.pagado_por,
          updated_by       = p_user_id,
          updated_at       = now();
    END IF;
  END LOOP;

  RETURN v_remito_id;
END $function$;

-- ── 2. comprar_faltante_item: el renglón nuevo hereda clase/devuelve/color ──
CREATE OR REPLACE FUNCTION public.comprar_faltante_item(p_item_id integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item      solicitud_compra_item%rowtype;
  v_efectiva  numeric;
  v_enviada   numeric;
  v_faltante  numeric;
  v_mcc_cobro integer;
  v_nuevo_id  integer;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'de_deposito' then
    raise exception 'ITEM_NO_DE_DEPOSITO';
  end if;

  v_efectiva := coalesce(v_item.cantidad_comprada, v_item.cantidad);
  v_enviada  := coalesce(v_item.cantidad_enviada, 0);
  v_faltante := v_efectiva - v_enviada;

  if v_enviada <= 0 then
    raise exception 'SIN_ENVIOS';
  end if;
  if v_faltante <= 0 then
    raise exception 'ITEM_COMPLETO';
  end if;

  select cobro_id into v_mcc_cobro
    from materiales_a_cuenta_cliente
   where item_id = p_item_id and cobro_id is not null;
  if found then
    raise exception 'ITEM_COBRADO' using detail = v_mcc_cobro::text;
  end if;

  if v_item.material_id is not null then
    update stock_materiales
       set stock_actual = stock_actual + v_faltante,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    update stock_movimientos
       set cantidad = greatest(cantidad - v_faltante, 0)
     where solicitud_item_id = p_item_id
       and tipo = 'salida'
       and motivo = 'despacho_obra';
  end if;

  update solicitud_compra_item
     set cantidad          = v_enviada,
         cantidad_comprada = null,
         estado            = 'enviado',
         fecha_envio       = current_date,
         updated_by        = p_user_id
   where id = p_item_id;

  update materiales_a_cuenta_cliente
     set cantidad     = v_enviada,
         precio_total = case when precio_unit is not null then v_enviada * precio_unit end,
         updated_by   = p_user_id
   where item_id = p_item_id and cobro_id is null;

  -- El faltante HEREDA clase y devuelve del original: si era herramienta, el
  -- renglón nuevo también lo es, y por lo tanto tampoco se factura.
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, material_id, estado, obs, clase, devuelve, color)
  values
    (v_item.solicitud_id, v_item.descripcion, v_faltante, v_item.unidad,
     v_item.material_id, 'pendiente',
     format('Faltante de depósito del renglón #%s — a comprar', p_item_id),
     v_item.clase, v_item.devuelve, v_item.color)
  returning id into v_nuevo_id;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'enviado', 'de_deposito', 'enviado', v_enviada,
     format('Partido: %s enviadas de depósito, %s pasan a compra (ítem #%s)', v_enviada, v_faltante, v_nuevo_id),
     jsonb_build_object('split_nuevo_item_id', v_nuevo_id, 'faltante', v_faltante), p_user_id),
    (v_nuevo_id, v_item.solicitud_id, 'creado', null, 'pendiente', v_faltante,
     format('Creado por faltante de depósito del ítem #%s', p_item_id),
     jsonb_build_object('split_item_origen_id', p_item_id), p_user_id);

  return jsonb_build_object(
    'item_original_id', p_item_id,
    'enviada',          v_enviada,
    'nuevo_item_id',    v_nuevo_id,
    'faltante',         v_faltante
  );
end;
$function$;
