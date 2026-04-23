-- =====================================================================
-- RPCs transaccionales para resolver ítems de solicitud_compra.
--
-- Reemplaza las ~10-14 llamadas secuenciales no-transaccionales que
-- hace hoy `solicitudesService.comprarItem` / `.despacharItem` por
-- una única función atómica con locks FOR UPDATE.
--
-- Invocación desde el backend Hono vía cliente per-request (JWT del
-- usuario autenticado). El permiso `certificaciones.creacion` lo
-- valida el middleware antes de llamar — la RPC asume autorización.
--
-- Activación detrás del feature flag `USE_RPC_RESOLVER` en el backend
-- (default off). Convivencia con la ruta legacy hasta validación.
-- =====================================================================


-- ── 1. Columna forzado_sin_stock en stock_movimientos ────────────────
-- Marca movimientos de despacho autorizados con saldo insuficiente.
-- Usamos columna dedicada en lugar de un `motivo` nuevo porque el
-- CHECK constraint sobre `motivo` restringe a 4 valores y agregar
-- uno rompería views/reports que asumen el conjunto cerrado.
alter table stock_movimientos
  add column if not exists forzado_sin_stock boolean not null default false;

-- ── 2. Índice parcial para auditar forzados ─────────────────────────
-- En >99% de filas el valor es false. Índice parcial mantiene el
-- tamaño mínimo y acelera alertas/reportes de uso de forzado.
create index if not exists stock_movimientos_forzado_sin_stock_idx
  on stock_movimientos (forzado_sin_stock)
  where forzado_sin_stock = true;


-- ── 3. resolver_item_compra ──────────────────────────────────────────
-- Resuelve un ítem de solicitud_compra vía compra externa a proveedor.
--
-- Ramas mutuamente excluyentes según obra y material_id:
--   A. Obra no-depósito: registra en materiales_a_cuenta_cliente
--      con origen='proveedor' (para facturar al cliente de la obra).
--   B. Obra depósito + material_id: suma stock, actualiza precio_ref,
--      registra stock_movimiento (motivo='compra', tipo='entrada').
--      NO inserta en materiales_a_cuenta_cliente (no es facturable).
--   C. Obra depósito sin material_id: solo update del ítem
--      (replica comportamiento del service legacy).
--
-- Idempotencia: UPDATE con filtro estado='pendiente'. Doble invocación
-- concurrente → la segunda observa estado='comprado' post-commit y
-- lanza ITEM_NO_DISPONIBLE.
--
-- Orden de locks: solicitud_compra_item → stock_materiales.
-- Mismo orden que resolver_item_despacho para evitar deadlocks.
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
  v_stock_pre      numeric;
  v_stock_post     numeric := NULL;
  v_mov_id         integer := NULL;
  v_mcc_id         integer := NULL;
  v_registrado_mcc boolean := false;
BEGIN
  -- (1a) Lock y validación del ítem.
  -- NOTA: PL/pgSQL no permite un %ROWTYPE dentro de un INTO multi-valor,
  -- por eso partimos el fetch en dos queries.
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

  -- (1b) Cargar obra del ítem (sin lock — no la mutamos).
  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  -- (2) Validar FKs "frescas" (puede haber sido dado de baja recién).
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

  -- (3) Lock de stock solo si estamos en rama B (obra depósito + material).
  IF v_es_deposito AND v_item.material_id IS NOT NULL THEN
    SELECT stock_actual INTO v_stock_pre
      FROM stock_materiales
     WHERE id = v_item.material_id
     FOR UPDATE;
  END IF;

  -- (4) UPDATE del ítem (común a las 3 ramas).
  UPDATE solicitud_compra_item
     SET estado           = 'comprado',
         proveedor_id     = p_proveedor_id,
         precio_unit      = p_precio_unit,
         factura_id       = p_factura_id,
         fecha_resolucion = current_date
   WHERE id = p_item_id;

  -- (5) Ramificación por obra/material.
  IF v_es_deposito AND v_item.material_id IS NOT NULL THEN
    -- Rama B: suma stock + movimiento, sin MCC.
    UPDATE stock_materiales
       SET stock_actual = v_stock_pre + v_item.cantidad,
           precio_ref   = p_precio_unit,
           updated_by   = p_user_id,
           updated_at   = now()
     WHERE id = v_item.material_id;

    INSERT INTO stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    VALUES
      (v_item.material_id, 'entrada', v_item.cantidad, 'compra',
       v_obra_cod, p_item_id, current_date, p_user_id, false)
    RETURNING id INTO v_mov_id;

    v_stock_post     := v_stock_pre + v_item.cantidad;
    v_registrado_mcc := false;
    v_mcc_id         := NULL;

  ELSIF v_es_deposito AND v_item.material_id IS NULL THEN
    -- Rama C: no-op sobre stock ni MCC (replica service legacy).
    v_stock_post     := NULL;
    v_registrado_mcc := false;
    v_mcc_id         := NULL;

  ELSE
    -- Rama A: obra no-depósito → registra en cuenta del cliente.
    -- UNIQUE (item_id) garantiza que no se duplique. Capturamos
    -- unique_violation y re-raise con nombre propio para que el
    -- backend mapee a 409 ITEM_YA_REGISTRADO en lugar de un 500
    -- genérico. El caso es inalcanzable por el check de estado
    -- salvo que alguien haya borrado la fila manualmente.
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

    v_stock_post     := NULL;
    v_registrado_mcc := true;
  END IF;

  -- (6) Retorno.
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
    v_mov_id,
    v_stock_post;
END;
$$;

comment on function public.resolver_item_compra(integer, integer, numeric, integer, uuid) is
  'Resuelve un item de solicitud_compra vía compra externa. Transaccional. 3 ramas según obra/material. Ver migración 20260422.';


-- ── 4. resolver_item_despacho ────────────────────────────────────────
-- Resuelve un ítem vía despacho desde depósito interno.
-- Valida saldo de stock (configurable con p_forzar_sin_stock).
--
-- Cuando p_forzar_sin_stock=true y el saldo es insuficiente, permite
-- dejar stock_actual en negativo y marca el stock_movimientos.forzado_sin_stock=true.
-- El permiso para usar este modo (`certificaciones.forzar_despacho`)
-- lo valida el backend antes de pasar el flag — la RPC confía.
--
-- Si material_id IS NULL (ítem texto-libre no vinculado al catálogo),
-- no toca stock: solo update de item + eventual MCC.
create or replace function public.resolver_item_despacho(
  p_item_id          integer,
  p_precio_unit      numeric,
  p_user_id          uuid    default null,
  p_forzar_sin_stock boolean default false
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
  stock_actual_post          numeric,
  stock_forzado              boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_item           solicitud_compra_item%ROWTYPE;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_stock_pre      numeric;
  v_stock_post     numeric := NULL;
  v_mov_id         integer := NULL;
  v_mcc_id         integer := NULL;
  v_registrado_mcc boolean := false;
BEGIN
  -- (1a) Lock y validación del ítem.
  -- NOTA: PL/pgSQL no permite un %ROWTYPE dentro de un INTO multi-valor,
  -- por eso partimos el fetch en dos queries.
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

  -- (1b) Cargar obra del ítem (sin lock — no la mutamos).
  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  -- (2) Lock de stock + validación de saldo (si hay material_id).
  IF v_item.material_id IS NOT NULL THEN
    SELECT stock_actual INTO v_stock_pre
      FROM stock_materiales
     WHERE id = v_item.material_id
     FOR UPDATE;

    IF v_stock_pre < v_item.cantidad AND NOT p_forzar_sin_stock THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE'
        USING DETAIL = json_build_object(
          'material_id',         v_item.material_id,
          'stock_actual',        v_stock_pre,
          'cantidad_solicitada', v_item.cantidad
        )::text;
    END IF;
  END IF;

  -- (3) UPDATE del ítem.
  UPDATE solicitud_compra_item
     SET estado           = 'de_deposito',
         precio_unit      = p_precio_unit,
         fecha_resolucion = current_date
   WHERE id = p_item_id;

  -- (4) Descuento de stock + movimiento (si aplica).
  IF v_item.material_id IS NOT NULL THEN
    UPDATE stock_materiales
       SET stock_actual = v_stock_pre - v_item.cantidad,
           updated_by   = p_user_id,
           updated_at   = now()
     WHERE id = v_item.material_id;

    INSERT INTO stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    VALUES
      (v_item.material_id, 'salida', v_item.cantidad, 'despacho_obra',
       v_obra_cod, p_item_id, current_date, p_user_id, p_forzar_sin_stock)
    RETURNING id INTO v_mov_id;

    v_stock_post := v_stock_pre - v_item.cantidad;
  END IF;

  -- (5) Registrar en cuenta del cliente solo si obra NO es depósito.
  -- Mismo handler de unique_violation que resolver_item_compra rama A,
  -- por simetría: si alguien borró manualmente una fila previa podría
  -- dispararse 23505; lo traducimos a ITEM_YA_REGISTRADO para que el
  -- backend mapee a 409 en lugar de un 500 genérico.
  IF NOT v_es_deposito THEN
    BEGIN
      INSERT INTO materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      VALUES
        (v_obra_cod, v_item.solicitud_id, p_item_id, v_item.descripcion,
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'deposito', NULL, NULL,
         current_date, p_user_id, p_user_id)
      RETURNING id INTO v_mcc_id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'ITEM_YA_REGISTRADO';
    END;

    v_registrado_mcc := true;
  ELSE
    v_registrado_mcc := false;
    v_mcc_id         := NULL;
  END IF;

  -- (6) Retorno.
  RETURN QUERY SELECT
    p_item_id,
    v_item.solicitud_id,
    v_obra_cod,
    'de_deposito'::text,
    v_item.material_id,
    v_item.cantidad,
    p_precio_unit,
    current_date,
    v_registrado_mcc,
    v_mcc_id,
    v_mov_id,
    v_stock_post,
    p_forzar_sin_stock;
END;
$$;

comment on function public.resolver_item_despacho(integer, numeric, uuid, boolean) is
  'Resuelve un item de solicitud_compra vía despacho de depósito. Transaccional. Flag p_forzar_sin_stock permite saldo negativo (autorización del backend). Ver migración 20260422.';


-- ── 5. GRANT EXECUTE ────────────────────────────────────────────────
-- El backend llama con cliente per-request (JWT del usuario) que
-- se autentica con rol `authenticated` — coherente con las policies
-- existentes sobre las tablas involucradas.
grant execute on function public.resolver_item_compra(integer, integer, numeric, integer, uuid)
  to authenticated;

grant execute on function public.resolver_item_despacho(integer, numeric, uuid, boolean)
  to authenticated;
