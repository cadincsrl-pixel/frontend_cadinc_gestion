-- Alinea resolver_item_compra (camino RPC, USE_RPC_RESOLVER=on) con el nuevo
-- flujo: COMPRAR = pedido al proveedor, el material todavía no llegó. El stock
-- NO entra al comprar. Para destino depósito, ingresa al RECIBIR (cuando se
-- marca enviado vía remito, en remitos-envio.service).
--
-- Cambio vs migración 20260422: se elimina la "Rama B" que sumaba stock +
-- registraba stock_movimiento al comprar a una obra depósito con material_id.
-- Ahora, para obra depósito (con o sin material), solo se actualiza el ítem a
-- 'comprado' (sin stock, sin MCC). El resto (Rama A: obra no-depósito → MCC)
-- queda igual.
--
-- create or replace preserva ACL: la función sigue revocada de `authenticated`
-- y ejecutable por service_role (migración 20260527); el backend la llama con
-- el cliente admin.

create or replace function public.resolver_item_compra(
  p_item_id      integer,
  p_proveedor_id integer,
  p_precio_unit  numeric,
  p_factura_id   integer default null,
  p_user_id      uuid    default null
)
returns table (
  item_id                    integer,
  solicitud_id               integer,
  obra_cod                   text,
  estado                     text,
  material_id                integer,
  cantidad                   numeric,
  precio_unit                numeric,
  fecha_resolucion           date,
  registrado_cuenta_cliente  boolean,
  material_cuenta_cliente_id integer,
  stock_movimiento_id        integer,
  stock_actual_post          numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_item           solicitud_compra_item%ROWTYPE;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_mcc_id         integer := NULL;
  v_registrado_mcc boolean := false;
BEGIN
  -- (1a) Lock y validación del ítem.
  SELECT * INTO v_item
    FROM solicitud_compra_item
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NO_EXISTE';
  END IF;
  IF v_item.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ITEM_NO_DISPONIBLE';
  END IF;

  -- (1b) Obra del ítem.
  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  -- (2) Validar FKs frescas.
  PERFORM 1 FROM proveedores WHERE id = p_proveedor_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVEEDOR_INVALIDO';
  END IF;

  IF p_factura_id IS NOT NULL THEN
    PERFORM 1 FROM facturas_compra WHERE id = p_factura_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FACTURA_INVALIDA';
    END IF;
  END IF;

  -- (3) UPDATE del ítem → comprado. (Pedido al proveedor; aún no llegó.)
  UPDATE solicitud_compra_item
     SET estado           = 'comprado',
         proveedor_id     = p_proveedor_id,
         precio_unit      = p_precio_unit,
         factura_id       = p_factura_id,
         fecha_resolucion = current_date
   WHERE id = p_item_id;

  -- (4) Cuenta del cliente solo para obra NO-depósito. El stock de depósito
  -- NO se toca acá: ingresa al recibir (remito), no al comprar.
  IF NOT v_es_deposito THEN
    BEGIN
      INSERT INTO materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      VALUES
        (v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'proveedor', p_proveedor_id,
         p_factura_id, current_date, p_user_id, p_user_id)
      RETURNING id INTO v_mcc_id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'ITEM_YA_REGISTRADO';
    END;
    v_registrado_mcc := true;
  END IF;

  -- (5) Retorno. stock_movimiento_id / stock_actual_post siempre NULL (el
  -- stock ya no se mueve al comprar).
  RETURN QUERY SELECT
    p_item_id,
    v_item.solicitud_id,
    v_obra_cod,
    'comprado'::text,
    v_item.material_id,
    v_item.cantidad,
    p_precio_unit,
    current_date,
    v_registrado_mcc,
    v_mcc_id,
    NULL::integer,
    NULL::numeric;
END;
$$;

comment on function public.resolver_item_compra(integer, integer, numeric, integer, uuid) is
  'Resuelve un item de solicitud_compra vía compra externa. Transaccional. Comprar = pedido (no entra stock); para depósito el stock ingresa al recibir. Ver migración 20260529_resolver_compra_sin_stock.';
