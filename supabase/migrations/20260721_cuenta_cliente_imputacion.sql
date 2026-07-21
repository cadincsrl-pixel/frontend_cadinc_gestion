-- Imputación de pagos del cliente a items del MCC (cuenta del cliente de
-- certificaciones) + comprobante en cobros + fix pagado_por en retiros.
--
-- Diseño (definido con el user 2026-07-21): patrón "simple" de alquiler/áridos —
-- cada item MCC se paga ENTERO por UN cobro (FK cobro_id, ON DELETE SET NULL);
-- un cobro puede cubrir N items; pagos sin items tildados quedan "a cuenta".
-- Como las filas MCC son mutables (retasación de precios, retiros parciales),
-- el monto se CONGELA al imputar en monto_cobrado; la edición de precio y el
-- revert de items imputados se bloquean en el backend (ITEM_COBRADO).

-- ── 1) Columnas nuevas ────────────────────────────────────────────────────────
alter table materiales_a_cuenta_cliente
  add column cobro_id integer references cuenta_cliente_cobros(id) on delete set null,
  add column monto_cobrado numeric;

create index mcc_cobro_idx on materiales_a_cuenta_cliente (cobro_id)
  where cobro_id is not null;

alter table cuenta_cliente_cobros
  add column comprobante_url  text,
  add column comprobante_hash text;

-- Dedup de comprobantes por contenido (mismo criterio que adelantos/remitos).
create unique index cuenta_cliente_cobros_hash_uq
  on cuenta_cliente_cobros (comprobante_hash)
  where comprobante_hash is not null;

-- ── 2) RPC transaccional de registro (calcada de crear_cobro_alquiler) ───────
create function public.registrar_cobro_cuenta_cliente(
  p_obra_cod         text,
  p_fecha            date,
  p_monto            numeric,
  p_medio            text,
  p_obs              text,
  p_comprobante_url  text,
  p_comprobante_hash text,
  p_item_ids         integer[],
  p_user_id          uuid
)
returns cuenta_cliente_cobros
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cobro          cuenta_cliente_cobros;
  v_total_imputado numeric := 0;
  v_invalidos      integer;
begin
  -- Lock por obra: dos cobros simultáneos de la misma obra no pueden imputar
  -- el mismo item dos veces.
  perform pg_advisory_xact_lock(hashtext('cuenta_cliente_cobro:' || p_obra_cod));

  if p_comprobante_hash is not null then
    perform 1 from cuenta_cliente_cobros where comprobante_hash = p_comprobante_hash;
    if found then
      raise exception 'COMPROBANTE_DUPLICADO' using errcode = 'P0001';
    end if;
  end if;

  if array_length(p_item_ids, 1) > 0 then
    -- Item imputable = fila MCC de ESTA obra, sin cobro previo, deuda real
    -- (pagado_por='cadinc'), tasado (precio_unit>0) y con el item de la
    -- solicitud en estado FINAL: whitelist en vez de excluir solo
    -- 'en_proveedor' (que puede crecer su total con retiros parciales) para
    -- que un item a mitad de un revert concurrente (ya 'pendiente') tampoco
    -- pase (TOCTOU con revertirItem, hallazgo del review 2026-07-21).
    select count(*) into v_invalidos
    from unnest(p_item_ids) as sel(id)
    left join materiales_a_cuenta_cliente m on m.id = sel.id
    left join solicitud_compra_item i on i.id = m.item_id
    where m.id is null
       or m.obra_cod <> p_obra_cod
       or m.cobro_id is not null
       or m.pagado_por <> 'cadinc'
       or m.precio_unit <= 0
       or i.estado is null
       or i.estado not in ('comprado', 'de_deposito', 'retirado', 'enviado');
    if v_invalidos > 0 then
      raise exception 'ITEM_INVALIDO'
        using errcode = 'P0001',
              detail = 'Algún item no es imputable (ya pagado / otra obra / sin tasar / pendiente de retiro).';
    end if;

    select coalesce(sum(precio_total), 0) into v_total_imputado
    from materiales_a_cuenta_cliente where id = any(p_item_ids);

    -- El monto del cobro debe cubrir los items tildados (tolerancia por
    -- redondeo de numerics).
    if p_monto + 0.01 < v_total_imputado then
      raise exception 'MONTO_INSUFICIENTE'
        using errcode = 'P0001',
              detail = format('monto=%s imputado=%s', p_monto, v_total_imputado);
    end if;
  end if;

  insert into cuenta_cliente_cobros
    (obra_cod, fecha, monto, medio, obs, comprobante_url, comprobante_hash,
     created_by, updated_by)
  values
    (p_obra_cod, p_fecha, p_monto, p_medio, nullif(p_obs, ''),
     p_comprobante_url, p_comprobante_hash, p_user_id, p_user_id)
  returning * into v_cobro;

  if array_length(p_item_ids, 1) > 0 then
    -- monto_cobrado congela el precio al momento del pago: si después se
    -- retasa el item, la rendición histórica no cambia.
    update materiales_a_cuenta_cliente
       set cobro_id      = v_cobro.id,
           monto_cobrado = precio_total,
           updated_by    = p_user_id,
           updated_at    = now()
     where id = any(p_item_ids);
  end if;

  return v_cobro;
end
$function$;

revoke all on function public.registrar_cobro_cuenta_cliente(
  text, date, numeric, text, text, text, text, integer[], uuid
) from public, anon, authenticated;
grant execute on function public.registrar_cobro_cuenta_cliente(
  text, date, numeric, text, text, text, text, integer[], uuid
) to service_role;

-- ── 3) RPC de eliminación (desimputa + borra en una TX) ──────────────────────
-- La FK ON DELETE SET NULL liberaría cobro_id sola, pero dejaría monto_cobrado
-- residual; esta RPC limpia ambos y borra el cobro atómicamente.
create function public.eliminar_cobro_cuenta_cliente(
  p_cobro_id integer,
  p_user_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_liberados integer;
begin
  perform 1 from cuenta_cliente_cobros where id = p_cobro_id for update;
  if not found then
    raise exception 'COBRO_NO_EXISTE' using errcode = 'P0001';
  end if;

  update materiales_a_cuenta_cliente
     set cobro_id = null, monto_cobrado = null, updated_by = p_user_id, updated_at = now()
   where cobro_id = p_cobro_id;
  get diagnostics v_liberados = row_count;

  delete from cuenta_cliente_cobros where id = p_cobro_id;

  return jsonb_build_object('success', true, 'items_liberados', v_liberados);
end
$function$;

revoke all on function public.eliminar_cobro_cuenta_cliente(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.eliminar_cobro_cuenta_cliente(integer, uuid)
  to service_role;

-- ── 4) Fix: retirar_de_proveedor perdía pagado_por ────────────────────────────
-- La versión 20260429 inserta en MCC sin pagado_por → default 'cadinc': un item
-- pagado por el cliente que quedó en proveedor y luego se retiró inflaba la
-- deuda (0 filas afectadas hoy, verificado 2026-07-21 — bug latente).
-- CREATE OR REPLACE con la MISMA firma conserva los grants existentes.
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
    -- (fix 2026-07-21) + pagado_por: antes no se seleccionaba y el INSERT al
    -- MCC caía al default 'cadinc' aunque el cliente hubiera pagado el item.
    SELECT id, solicitud_id, estado, proveedor_id, descripcion, unidad,
           cantidad, precio_unit, factura_id, pagado_por
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

    IF NOT COALESCE(v_obra_es_dep, false) THEN
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
