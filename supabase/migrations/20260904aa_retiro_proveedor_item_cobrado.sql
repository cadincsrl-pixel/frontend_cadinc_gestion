-- 20260904aa — retirar_de_proveedor: un item ya cobrado al cliente no admite más retiros
--
-- Regla del user (2026-09-04): una vez cobrado, el renglón de la cuenta del
-- cliente está congelado. Editar el precio, revertir el envío y sacarlo de la
-- cuenta ya lo respetaban (ITEM_COBRADO). El retiro parcial de stock en
-- proveedor no: cada retiro hace UPSERT de la fila MCC con la cantidad
-- acumulada y el total, y si la fila se había cobrado entre un retiro y el
-- siguiente, la pisaba igual y la rendición quedaba descuadrada.
--
-- Ahora, antes de tocar nada de ese item, se chequea la imputación y se corta
-- con el mismo ITEM_COBRADO (detail = cobro_id). La función es una sola
-- transacción, así que el remito RR no queda a medias. Lo que falte retirar
-- se resuelve a mano después del cobro. Cuerpo idéntico a 20260902w salvo
-- la variable `v_mcc_cobro` y el bloque marcado.

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
  v_mcc_cobro integer;
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

    -- La fila de la cuenta del cliente ya se cobró: está congelada. Un retiro
    -- más le pisaría cantidad y total (20260904aa).
    SELECT cobro_id INTO v_mcc_cobro
      FROM materiales_a_cuenta_cliente
     WHERE item_id = v_item.id AND cobro_id IS NOT NULL;
    IF v_mcc_cobro IS NOT NULL THEN
      RAISE EXCEPTION 'ITEM_COBRADO' USING ERRCODE='P0001', DETAIL=v_mcc_cobro::text;
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
          updated_at       = now()
      WHERE materiales_a_cuenta_cliente.cobro_id IS NULL;   -- cinturón además de los tiradores
    END IF;
  END LOOP;

  RETURN v_remito_id;
END $function$;
