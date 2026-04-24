-- =====================================================================
-- Auth gate en RPCs resolver_item_compra / resolver_item_despacho.
--
-- Problema que resuelve:
-- Las RPCs son SECURITY DEFINER con GRANT EXECUTE a authenticated. Un
-- atacante con un JWT de cualquier usuario autenticado podía invocar
-- la RPC directo con la anon key + su JWT, saltando el requirePermiso
-- del backend Hono. Efecto: escalada de privilegios (resolver ítems de
-- solicitud_compra, mover stock, registrar en cuenta del cliente) sin
-- el permiso certificaciones.creacion ni certificaciones.forzar_despacho.
--
-- Fix (defensa en profundidad):
-- Cada RPC valida INTERNAMENTE que auth.uid() tenga el permiso necesario
-- antes de mutar nada. El helper _require_permiso_or_admin centraliza el
-- chequeo: admin bypassa, otros necesitan permisos[modulo][accion]=true.
--
-- El backend sigue validando con requirePermiso ANTES de llamar: la RPC
-- solo es el último punto de control. Mapeos de error en solicitudes.service.ts.
-- =====================================================================


-- ── 1. Helper de permisos ───────────────────────────────────────────
-- Reusable para cualquier RPC sensible. Centraliza la lectura de
-- profiles.permisos (JSONB) y la regla de bypass admin.
create or replace function public._require_permiso_or_admin(
  p_modulo text,
  p_accion text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_uid     uuid := auth.uid();
  v_rol     text;
  v_permisos jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH';
  END IF;

  SELECT rol, permisos
    INTO v_rol, v_permisos
    FROM profiles
   WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIN_PERFIL';
  END IF;

  -- Admin bypass
  IF v_rol = 'admin' THEN
    RETURN;
  END IF;

  -- Chequeo del flag permisos[modulo][accion] === true
  IF COALESCE((v_permisos -> p_modulo ->> p_accion)::boolean, false) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'SIN_PERMISO'
    USING DETAIL = json_build_object(
      'modulo', p_modulo,
      'accion', p_accion
    )::text;
END;
$$;

comment on function public._require_permiso_or_admin(text, text) is
  'Valida que auth.uid() tenga permisos[modulo][accion]=true o rol=admin. Raise NO_AUTH / SIN_PERFIL / SIN_PERMISO.';

grant execute on function public._require_permiso_or_admin(text, text) to authenticated;


-- ── 2. resolver_item_compra con gate ─────────────────────────────────
-- Misma lógica que la migración 20260422_rpc_resolver_items.sql, pero
-- con chequeo de permiso certificaciones.creacion como primer paso.
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
  -- (0) Auth gate — defensa en profundidad. El backend ya validó con
  -- requirePermiso, pero si alguien llama la RPC directo con anon key,
  -- esto la bloquea.
  PERFORM public._require_permiso_or_admin('certificaciones', 'creacion');

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

  -- (1b) Cargar obra del ítem (sin lock — no la mutamos).
  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  -- (2) Validar FKs "frescas".
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

  -- (3) Lock de stock solo si rama B.
  IF v_es_deposito AND v_item.material_id IS NOT NULL THEN
    SELECT stock_actual INTO v_stock_pre
      FROM stock_materiales
     WHERE id = v_item.material_id
     FOR UPDATE;
  END IF;

  -- (4) UPDATE del ítem.
  UPDATE solicitud_compra_item
     SET estado           = 'comprado',
         proveedor_id     = p_proveedor_id,
         precio_unit      = p_precio_unit,
         factura_id       = p_factura_id,
         fecha_resolucion = current_date
   WHERE id = p_item_id;

  -- (5) Ramificación por obra/material.
  IF v_es_deposito AND v_item.material_id IS NOT NULL THEN
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
    v_stock_post     := NULL;
    v_registrado_mcc := false;
    v_mcc_id         := NULL;

  ELSE
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
  'Resuelve un item de solicitud_compra vía compra externa. Transaccional + auth gate (certificaciones.creacion). Ver migración 20260424.';


-- ── 3. resolver_item_despacho con gate ───────────────────────────────
-- Chequea certificaciones.creacion como permiso base, y adicionalmente
-- certificaciones.forzar_despacho si p_forzar_sin_stock=true.
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
  -- (0) Auth gate. Base = certificaciones.creacion.
  PERFORM public._require_permiso_or_admin('certificaciones', 'creacion');

  -- (0b) Si forzar_sin_stock, chequeo adicional del flag
  -- certificaciones.forzar_despacho. Separate check para poder darle
  -- un mensaje propio al usuario.
  IF p_forzar_sin_stock THEN
    PERFORM public._require_permiso_or_admin('certificaciones', 'forzar_despacho');
  END IF;

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

  -- (1b) Cargar obra del ítem.
  SELECT s.obra_cod, o.es_deposito
    INTO v_obra_cod, v_es_deposito
    FROM solicitud_compra s
    JOIN obras            o ON o.cod = s.obra_cod
   WHERE s.id = v_item.solicitud_id;

  -- (2) Lock de stock + validación de saldo.
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

  -- (4) Descuento de stock + movimiento.
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

  -- (5) Registrar en cuenta del cliente si obra no es depósito.
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
  'Resuelve un item vía despacho. Transaccional + auth gate (certificaciones.creacion; forzar_despacho si p_forzar_sin_stock). Ver migración 20260424.';
