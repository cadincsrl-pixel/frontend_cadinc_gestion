-- =====================================================================
-- Tesorería: tarjeta de crédito y billetera; compras pagadas en lote
-- (2026-09-27)
--
-- Por qué: pedido del dueño (24/09). Las compras de Mercado Libre y
-- similares son facturas de VENDEDORES DISTINTOS ya pagadas en el momento
-- con la tarjeta de crédito de la empresa o con saldo de Mercado Pago. Cada
-- OP es de un solo proveedor, así que hacía falta una OP por factura a mano.
--
-- 1) tesoreria_cuentas.tipo suma 'tarjeta' (tarjeta de crédito de la
--    empresa: es un PASIVO; sin CBU ni alias; `banco` = emisor, ej. «Visa
--    Galicia») y 'billetera' (Mercado Pago u otra: admite CBU con el CVU de
--    22 dígitos —mismo dígito verificador que un CBU— y alias).
--    «CBU/alias solo bancos» pasa a «solo banco y billetera».
-- 2) fn_tesoreria_cuenta_valida (anclas sobre la definición viva): la cuenta
--    contable de una tarjeta es del PASIVO (ej. «Tarjeta de crédito a
--    pagar»); banco, caja, valores y billetera siguen exigiendo ACTIVO. El
--    trigger ahora también corre al cambiar el tipo.
--    El motor de asientos (20260927e) usa tesoreria_cuentas.cuenta_id tal
--    cual: una OP pagada con tarjeta acredita la cuenta del pasivo; nada
--    especial.
-- 3) pagos_marcar_pagadas: UNA OP POR FACTURA (cada una a su proveedor) con
--    forma 'tarjeta' (cuenta de tipo tarjeta) u 'otro' (saldo de billetera,
--    cuenta de tipo billetera), por el saldo pagable. Todo o nada; máx. 200.
--    Fecha de cada OP = p_fecha o, si es null, la fecha de la factura.
--
--    EXCEPCIÓN A LA DOBLE FIRMA (§5.18), acotada a tarjeta/billetera: es un
--    hecho consumado, igual que «ya pagada al cargar» con tarjeta/efectivo.
--    Usa _pagos_emitir_orden con p_exigir_aprobada = false (el mismo camino
--    que pagos_crear_factura para la pagada al cargar): NO exige aprobación
--    y por eso NO aplican NO_PUEDE_PAGAR_PROPIA ni NO_PUEDE_PAGAR_LO_QUE_APROBO
--    (en el código vivo solo se chequean con p_exigir_aprobada = true). El
--    flag no llega desde el cliente: lo fija esta RPC.
--    Admite facturas sin_imputar. Una factura no aprobada queda con saldo 0
--    pero en estado 'pendiente' (_pagos_recalcular_estado solo pasa a
--    'pagada' si está aprobada o se pagó al cargar): al aprobarla (después
--    de imputarla) pasa sola a 'pagada'.
--    Permiso: admin o pagos.creacion (lo repite el backend).
-- =====================================================================

-- ── 1) Tipos de cuenta de tesorería ────────────────────────────────────
alter table public.tesoreria_cuentas drop constraint tesoreria_cuentas_tipo_check;
alter table public.tesoreria_cuentas
  add constraint tesoreria_cuentas_tipo_check check (tipo in ('banco', 'caja', 'valores', 'tarjeta', 'billetera'));
alter table public.tesoreria_cuentas drop constraint tesoreria_cuentas_cbu_solo_banco;
alter table public.tesoreria_cuentas
  add constraint tesoreria_cuentas_cbu_solo_banco check (tipo in ('banco', 'billetera') or (cbu is null and alias is null));

comment on column public.tesoreria_cuentas.tipo is
  'banco | caja | valores | tarjeta (tarjeta de crédito de la empresa: pasivo; banco = emisor) | billetera (Mercado Pago u otra; cbu = CVU). 20260927h.';

-- ── 2) La cuenta contable de una tarjeta es del pasivo ─────────────────
create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

do $m$
declare
  v text := pg_get_functiondef('public.fn_tesoreria_cuenta_valida()'::regprocedure);
begin
  v := pg_temp._una(v,
$a$c.rubro = 'activo')$a$,
$a$c.rubro = case when new.tipo = 'tarjeta' then 'pasivo' else 'activo' end)$a$);
  v := pg_temp._una(v,
$a$detail = json_build_object('cuenta_id', new.cuenta_id)::text;$a$,
$a$detail = json_build_object('cuenta_id', new.cuenta_id, 'tipo', new.tipo,
                                 'rubro_esperado', case when new.tipo = 'tarjeta' then 'pasivo' else 'activo' end)::text;$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);

drop trigger trg_tesoreria_cuenta_valida on public.tesoreria_cuentas;
create trigger trg_tesoreria_cuenta_valida before insert or update of cuenta_id, tipo on public.tesoreria_cuentas
  for each row execute function public.fn_tesoreria_cuenta_valida();

-- ── 3) Marcar pagadas en lote (tarjeta / billetera) ────────────────────
create or replace function public.pagos_marcar_pagadas(p_factura_ids bigint[], p_cuenta_origen_id bigint, p_forma text,
                                                       p_fecha date, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids    bigint[];
  v_id     bigint;
  t        public.tesoreria_cuentas%rowtype;
  f        public.pagos_facturas%rowtype;
  v_saldo  numeric(14,2);
  v_fecha  date;
  v_oid    bigint;
  v_out    jsonb := '[]'::jsonb;
  v_total  numeric(14,2) := 0;
  v_ref    text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not (public._pagos_es_admin(p_user_id) or public._pagos_flag(p_user_id, 'creacion', false)) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'creacion')::text;
  end if;
  if coalesce(p_forma, '') not in ('tarjeta', 'otro') then
    raise exception 'FORMA_PAGO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'forma_pago', 'forma_pago', p_forma)::text;
  end if;
  select * into t from public.tesoreria_cuentas where id = p_cuenta_origen_id and activo;
  if not found then
    raise exception 'CUENTA_ORIGEN_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'cuenta_origen_id', 'cuenta_origen_id', p_cuenta_origen_id)::text;
  end if;
  if (p_forma = 'tarjeta' and t.tipo <> 'tarjeta') or (p_forma = 'otro' and t.tipo <> 'billetera') then
    raise exception 'FORMA_NO_COINCIDE_CUENTA' using errcode = 'P0001',
      detail = json_build_object('campo', 'cuenta_origen_id', 'forma_pago', p_forma, 'tipo', t.tipo)::text;
  end if;
  if p_fecha is not null and p_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001',
      detail = json_build_object('campo', 'fecha', 'fecha', p_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_factura_ids) x where x is not null;
  if v_ids is null then raise exception 'SIN_FILAS' using errcode = 'P0001'; end if;
  if array_length(v_ids, 1) > 200 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 200)::text;
  end if;

  v_ref := 'Pago en lote (' || case when p_forma = 'tarjeta' then 'tarjeta' else 'billetera' end || ')';

  -- Locks en orden de id (mismo orden que el resto de las RPC de Pagos).
  perform 1 from public.pagos_facturas where id = any (v_ids) order by id for update;

  foreach v_id in array v_ids loop
    select * into f from public.pagos_facturas where id = v_id;
    if not found then
      raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', v_id)::text;
    end if;
    if f.clase = 'nota_credito' then
      raise exception 'NC_NO_SE_PAGA' using errcode = 'P0001', detail = json_build_object('factura_id', v_id)::text;
    end if;
    if f.estado = 'anulada' then
      raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
        detail = json_build_object('factura_id', v_id, 'estado', f.estado)::text;
    end if;
    if f.paga_cliente then
      raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', v_id)::text;
    end if;
    v_saldo := public._pagos_saldo_factura(v_id, true);
    if v_saldo <= 0 then
      raise exception 'FACTURA_SIN_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', v_id, 'saldo_pagable', v_saldo)::text;
    end if;
    v_fecha := coalesce(p_fecha, f.fecha);
    if v_fecha < f.fecha then
      raise exception 'FECHA_ANTERIOR_A_FACTURA' using errcode = 'P0001',
        detail = json_build_object('campo', 'fecha', 'factura_id', v_id, 'fecha', v_fecha, 'fecha_factura', f.fecha)::text;
    end if;

    v_oid := public._pagos_emitir_orden(
      f.proveedor_id,
      jsonb_build_object('proveedor_id', f.proveedor_id, 'fecha', v_fecha, 'forma_pago', p_forma,
                         'cuenta_origen_id', p_cuenta_origen_id, 'referencia', v_ref, 'monto_pagado', v_saldo),
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', v_id, 'monto', v_saldo)),
      null, p_user_id, false);

    v_out := v_out || jsonb_build_object('factura_id', v_id, 'orden_id', v_oid,
                                         'numero', (select o.numero from public.pagos_ordenes o where o.id = v_oid));
    v_total := v_total + v_saldo;
  end loop;

  return jsonb_build_object('ordenes', v_out, 'total', v_total);
end $$;

comment on function public.pagos_marcar_pagadas(bigint[], bigint, text, date, uuid) is
  'Marca pagadas (una OP por factura) compras hechas con la tarjeta de la empresa o con saldo de billetera. Hecho consumado: excepción acotada a la doble firma. 20260927h.';

revoke all on function public.pagos_marcar_pagadas(bigint[], bigint, text, date, uuid) from public, anon, authenticated;
grant execute on function public.pagos_marcar_pagadas(bigint[], bigint, text, date, uuid) to service_role;
