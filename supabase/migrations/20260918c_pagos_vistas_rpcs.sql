-- =====================================================================
-- Módulo Pagos, fase 1 — vistas y RPCs (2026-09-18)
--
-- Requiere 20260918a (tablas) y 20260918b (bucket).
--
-- Vistas (security_invoker, columnas explícitas, nombres de usuario por
-- left join profiles — nunca embeds desde PostgREST):
--   v_pagos_facturas, v_pagos_ordenes, v_pagos_proveedor_saldo, v_pagos_proveedores
--
-- RPCs (SECURITY DEFINER, EXECUTE solo service_role, p_user_id explícito, sin
-- auth.uid()). Errores: `raise exception 'CODIGO' using errcode='P0001',
-- detail = '<json>'` — el backend lee error.message como código y
-- error.details como JSON (patrón de solicitudes.service.ts / cuenta-cliente).
--
-- Reglas que viven acá y en ningún otro lado:
--   * `_pagos_validar_pagable` es LA regla "solo se paga lo aprobado" y la
--     usan las tres clases de línea (factura, a_cuenta no aplica, nota_credito).
--   * Tres separaciones de funciones con bypass por rol = 'admin' (decisión 2):
--     NO_PUEDE_APROBAR_PROPIA, NO_PUEDE_PAGAR_PROPIA, NO_PUEDE_PAGAR_LO_QUE_APROBO.
--   * "Ya pagada al cargar" sin tope (decisión 3): compras solo tarjeta/efectivo,
--     admin cualquier forma (PAGADA_AL_CARGAR_FORMA).
--   * NC como línea de la OP (decisión 7): la OP guarda monto_pagado (plata) y
--     monto_nc (crédito). Comprobante obligatorio por forma solo si sale plata;
--     una línea NC exige el PDF de la NC (adjunto tipo nota_credito).
--   * El número OP-NNNN se asigna al final, bajo advisory lock, sin huecos.
--   * Centro de costo (decisión 4): `_pagos_centro_de` es LA regla del
--     agrupador. Obra interna o depósito → su propio nombre (PAÑOL Y OFICINA,
--     LOGISTICA, HERREROS, PODA, MANTENIMIENTO, DEPOSITO), aunque obras.cc
--     diga otra cosa (CC PODA tiene cc = 'IGLESIAS' y NO se migra); obra de
--     cliente → obras.cc, o el nombre si no tiene. La usan v_pagos_facturas,
--     pagos_resumen y pagos_ordenes_resumen; el filtro centro_costo del
--     backend (centros_cc) hereda la misma regla.
--
-- Termina con un bloque funcional que ejerce el circuito entero y hace
-- `raise exception 'ROLLBACK_OK …'`; el raise se atrapa en el bloque externo
-- (subtransacción deshecha, base intacta) para que la migración se pueda
-- aplicar. Si algo del circuito falla, el error NO se atrapa y la migración
-- aborta.
-- =====================================================================

-- ── Centro de costo ───────────────────────────────────────────────────
-- Decisión 4: cada obra interna (y el depósito) es su propio centro dentro
-- del bloque "Estructura CADINC"; las obras de cliente se agrupan por obras.cc.
-- No se migra obras.cc (CC PODA sigue con cc = 'IGLESIAS' para lo demás).
create or replace function public._pagos_centro_de(p_cc text, p_nom text, p_es_interna boolean, p_es_deposito boolean)
returns text language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case when coalesce(p_es_interna, false) or coalesce(p_es_deposito, false) then p_nom
              else coalesce(nullif(btrim(p_cc), ''), p_nom) end
$$;
comment on function public._pagos_centro_de(text, text, boolean, boolean) is
  'Agrupador de centro de costo del módulo Pagos: obra interna/depósito → su nombre; obra de cliente → obras.cc o el nombre.';

-- ── Vistas ────────────────────────────────────────────────────────────

create view public.v_pagos_facturas with (security_invoker = true) as
select f.id, f.proveedor_id, f.tipo_comprobante, f.numero, f.numero_norm, f.fecha, f.vence_el,
       f.neto, f.iva, f.percepciones, f.otros, f.total, f.imputable, f.forma_pago_prevista, f.estado,
       f.paga_cliente, f.pagada_al_cargar, f.aprobada_por, f.aprobada_at,
       f.motivo_observacion, f.observada_por, f.observada_at,
       f.motivo_anulacion, f.anulado_por, f.anulado_at, f.descripcion, f.obs,
       f.created_at, f.updated_at, f.created_by, f.updated_by,
       p.razon_social as proveedor_nom, p.cuit as proveedor_cuit, p.activo as proveedor_activo,
       p.alias_cbu as proveedor_alias, p.cbu as proveedor_cbu,            -- el backend los enmascara sin ver_pii
       right(p.cbu, 4) as proveedor_cbu_ultimos4,
       p.datos_pago_actualizados_at, p.datos_pago_actualizados_por,
       (f.aprobada_at is not null and p.datos_pago_actualizados_at > f.aprobada_at) as cuenta_cambio_tras_aprobar,
       pa.nombre as aprobada_por_nombre, pc.nombre as created_by_nombre,
       po.nombre as observada_por_nombre, pn.nombre as anulado_por_nombre,
       coalesce(pg.pagado, 0)::numeric(14,2)     as pagado,       -- plata aplicada (líneas factura vigentes)
       coalesce(pg.acreditado, 0)::numeric(14,2) as acreditado,   -- notas de crédito vigentes
       (case when f.paga_cliente or f.estado = 'anulada' then 0     -- una anulada no es deuda
             else f.total - coalesce(pg.pagado, 0) - coalesce(pg.acreditado, 0) end)::numeric(14,2) as saldo,
       (f.estado in ('pendiente','observada','aprobada','pagada_parcial') and not f.paga_cliente
          and f.vence_el is not null and f.vence_el < public.hoy_ar())   as vencida,
       (public.hoy_ar() - f.vence_el)                                    as dias_vencida,   -- >0 vencida, <0 por vencer, null sin vencimiento
       (f.pagada_al_cargar and f.aprobada_at is null and f.estado <> 'anulada') as sin_revisar,
       to_char(f.fecha, 'YYYY-MM')                                       as mes_emision,
       im.centro_costo, im.centros, im.obras_cod, im.centros_cc, im.es_interna, im.todas_archivadas,
       coalesce(adj.tiene_factura_adj, false) as tiene_factura_adj,
       (f.numero is null) as sin_numero,
       case when ult.numero is null then null else 'OP-' || lpad(ult.numero::text, 4, '0') end as ultima_op,
       ult.fecha as ultimo_pago,
       public.norm_txt(coalesce(f.numero, '') || ' ' || p.razon_social || ' ' || coalesce(p.cuit, '') || ' '
                       || f.descripcion || ' ' || coalesce(im.centros, '') || ' ' || f.obs) as busq
from public.pagos_facturas f
join public.pagos_proveedores p on p.id = f.proveedor_id
left join public.profiles pa on pa.id = f.aprobada_por
left join public.profiles pc on pc.id = f.created_by
left join public.profiles po on po.id = f.observada_por
left join public.profiles pn on pn.id = f.anulado_por
left join lateral (
  select sum(l.monto) filter (where l.tipo = 'factura')      as pagado,
         sum(l.monto) filter (where l.tipo = 'nota_credito') as acreditado
    from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
   where l.factura_id = f.id and o.estado = 'emitida') pg on true
left join lateral (
  select (array_agg(public._pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) order by i.monto desc, i.id))[1] as centro_costo,
         string_agg(public._pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) || ' $' || round(i.monto), ' · ' order by i.monto desc, i.id) as centros,
         array_agg(i.obra_cod order by i.monto desc, i.id) as obras_cod,
         array_agg(distinct public._pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito)) as centros_cc,
         bool_or(o.es_interna or o.es_deposito) as es_interna,
         bool_and(coalesce(o.archivada, false)) as todas_archivadas
    from public.pagos_imputaciones i join public.obras o on o.cod = i.obra_cod
   where i.factura_id = f.id) im on true
left join lateral (
  select bool_or(a.tipo = 'factura') as tiene_factura_adj
    from public.pagos_facturas_adjuntos a where a.factura_id = f.id and a.deleted_at is null) adj on true
left join lateral (
  select o.numero, o.fecha
    from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
   where l.factura_id = f.id and o.estado = 'emitida'
   order by o.fecha desc, o.id desc limit 1) ult on true;

create view public.v_pagos_ordenes with (security_invoker = true) as
select o.id, o.numero, 'OP-' || lpad(o.numero::text, 4, '0') as numero_fmt,
       o.proveedor_id, o.fecha, o.fecha_cobro, o.forma_pago, o.referencia,
       o.cbu_destino, o.alias_destino, right(o.cbu_destino, 4) as cbu_destino_ultimos4,
       o.monto_pagado, o.monto_nc, o.monto_aplicado, o.estado,
       o.motivo_anulacion, o.anulado_por, o.anulado_at, o.obs,
       o.created_at, o.updated_at, o.created_by, o.updated_by,
       p.razon_social as proveedor_nom, p.cuit as proveedor_cuit,
       pc.nombre as created_by_nombre, pn.nombre as anulado_por_nombre,
       ln.facturas, coalesce(ln.cantidad_facturas, 0)::int as cantidad_facturas,
       coalesce(ln.a_cuenta, 0)::numeric(14,2) as a_cuenta,
       (coalesce(ln.nc, 0) > 0) as tiene_nc,
       coalesce(adj.tiene_comprobante, false) as tiene_comprobante,
       coalesce(adj.tiene_nc_adjunto, false)  as tiene_nc_adjunto,
       (o.monto_pagado > 0 and o.forma_pago in ('transferencia','echeq')) as comprobante_requerido,
       (o.estado = 'emitida' and o.fecha_cobro is not null and o.fecha_cobro > public.hoy_ar()) as en_cartera,
       to_char(o.fecha, 'YYYY-MM') as mes_pago,
       public.norm_txt('op ' || o.numero::text || ' ' || p.razon_social || ' ' || coalesce(p.cuit, '') || ' '
                       || o.referencia || ' ' || coalesce(ln.facturas, '') || ' ' || o.obs) as busq
from public.pagos_ordenes o
join public.pagos_proveedores p on p.id = o.proveedor_id
left join public.profiles pc on pc.id = o.created_by
left join public.profiles pn on pn.id = o.anulado_por
left join lateral (
  select string_agg(case when l.tipo = 'a_cuenta' then 'a cuenta'
                         when l.tipo = 'nota_credito' then 'NC ' || l.nc_numero || ' s/ ' || f.tipo_comprobante || ' ' || coalesce(f.numero, 's/n')
                         else f.tipo_comprobante || ' ' || coalesce(f.numero, 's/n') end, ', ' order by l.id) as facturas,
         count(distinct l.factura_id) as cantidad_facturas,
         sum(l.monto) filter (where l.tipo = 'a_cuenta')     as a_cuenta,
         sum(l.monto) filter (where l.tipo = 'nota_credito') as nc
    from public.pagos_orden_lineas l left join public.pagos_facturas f on f.id = l.factura_id
   where l.orden_id = o.id) ln on true
left join lateral (
  select bool_or(a.tipo = 'comprobante_pago') as tiene_comprobante,
         bool_or(a.tipo = 'nota_credito')     as tiene_nc_adjunto
    from public.pagos_ordenes_adjuntos a where a.orden_id = o.id and a.deleted_at is null) adj on true;

-- Estado de cuenta por proveedor: activos e inactivos mientras tengan saldo o anticipos.
create view public.v_pagos_proveedor_saldo with (security_invoker = true) as
select p.id as proveedor_id, p.razon_social, p.cuit, p.activo,
       p.alias_cbu, p.cbu, right(p.cbu, 4) as cbu_ultimos4,
       coalesce(s.facturas_abiertas, 0)::int as facturas_abiertas,
       coalesce(s.para_aprobar, 0)::int      as para_aprobar,
       coalesce(s.saldo, 0)::numeric(14,2)          as saldo,
       coalesce(s.saldo_aprobado, 0)::numeric(14,2) as saldo_aprobado,
       coalesce(s.vencido, 0)::numeric(14,2)        as vencido,
       s.mas_vieja,
       coalesce(ac.a_cuenta, 0)::numeric(14,2) as a_cuenta_sin_aplicar,   -- fase 2: − aplicaciones vigentes
       (coalesce(s.saldo, 0) - coalesce(ac.a_cuenta, 0))::numeric(14,2) as saldo_neto,
       ac.ultimo_pago
from public.pagos_proveedores p
left join lateral (
  select count(*) as facturas_abiertas,
         count(*) filter (where v.estado = 'pendiente') as para_aprobar,
         sum(v.saldo) as saldo,
         sum(v.saldo) filter (where v.estado in ('aprobada','pagada_parcial')) as saldo_aprobado,
         sum(v.saldo) filter (where v.vencida) as vencido,
         min(v.vence_el) as mas_vieja
    from public.v_pagos_facturas v
   where v.proveedor_id = p.id and not v.paga_cliente
     and v.estado in ('pendiente','observada','aprobada','pagada_parcial')) s on true
left join lateral (
  select sum(l.monto) filter (where l.tipo = 'a_cuenta') as a_cuenta, max(o.fecha) as ultimo_pago
    from public.pagos_ordenes o left join public.pagos_orden_lineas l on l.orden_id = o.id
   where o.proveedor_id = p.id and o.estado = 'emitida') ac on true
where p.activo or coalesce(s.saldo, 0) > 0 or coalesce(ac.a_cuenta, 0) > 0;

create view public.v_pagos_proveedores with (security_invoker = true) as
select p.id, p.razon_social, p.razon_social_norm, p.cuit, p.alias_cbu, p.cbu, right(p.cbu, 4) as cbu_ultimos4,
       p.banco, p.plazo_pago_dias, p.contacto, p.telefono, p.email, p.obs, p.activo,
       p.baja_motivo, p.baja_por, p.baja_at, p.datos_pago_actualizados_at, p.datos_pago_actualizados_por,
       p.created_at, p.updated_at, p.created_by, p.updated_by,
       pb.nombre as baja_por_nombre, pd.nombre as datos_pago_actualizados_por_nombre,
       coalesce(s.saldo, 0)::numeric(14,2) as saldo,
       coalesce(s.saldo_aprobado, 0)::numeric(14,2) as saldo_aprobado,
       coalesce(ac.a_cuenta, 0)::numeric(14,2) as a_cuenta_sin_aplicar,
       ac.ultimo_pago,
       coalesce(fc.facturas, 0)::int as facturas,
       (p.cbu is null and p.alias_cbu is null) as sin_datos_pago,
       public.norm_txt(p.razon_social || ' ' || coalesce(p.cuit, '') || ' ' || coalesce(p.alias_cbu, '') || ' ' || p.contacto) as busq
from public.pagos_proveedores p
left join public.profiles pb on pb.id = p.baja_por
left join public.profiles pd on pd.id = p.datos_pago_actualizados_por
left join lateral (
  select sum(v.saldo) as saldo,
         sum(v.saldo) filter (where v.estado in ('aprobada','pagada_parcial')) as saldo_aprobado
    from public.v_pagos_facturas v
   where v.proveedor_id = p.id and not v.paga_cliente
     and v.estado in ('pendiente','observada','aprobada','pagada_parcial')) s on true
left join lateral (
  select sum(l.monto) filter (where l.tipo = 'a_cuenta') as a_cuenta, max(o.fecha) as ultimo_pago
    from public.pagos_ordenes o left join public.pagos_orden_lineas l on l.orden_id = o.id
   where o.proveedor_id = p.id and o.estado = 'emitida') ac on true
left join lateral (
  select count(*) as facturas from public.pagos_facturas f where f.proveedor_id = p.id and f.estado <> 'anulada') fc on true;

do $$
declare v text;
begin
  foreach v in array array['v_pagos_facturas','v_pagos_ordenes','v_pagos_proveedor_saldo','v_pagos_proveedores'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v);
    execute format('grant select on table public.%I to service_role', v);
  end loop;
end $$;

-- ── Helpers internos ──────────────────────────────────────────────────

create or replace function public._pagos_es_admin(p_user_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce((select p.rol = 'admin' from public.profiles p where p.id = p_user_id), false)
$$;

-- Cuadre del desglose: solo cuando vienen neto e iva los dos (±0,01).
create or replace function public._pagos_validar_desglose(p_neto numeric, p_iva numeric, p_percepciones numeric, p_otros numeric, p_total numeric)
returns void language plpgsql set search_path = public, pg_temp as $$
declare v_suma numeric(14,2);
begin
  if p_neto is null or p_iva is null then return; end if;
  v_suma := p_neto + p_iva + coalesce(p_percepciones, 0) + coalesce(p_otros, 0);
  if abs(v_suma - p_total) > 0.01 then
    raise exception 'DESGLOSE_NO_CUADRA' using errcode = 'P0001',
      detail = json_build_object('suma', v_suma, 'total', p_total)::text;
  end if;
end $$;

-- Reemplaza el reparto de una factura. sum(monto) = imputable (±0,01).
create or replace function public._pagos_reemplazar_imputaciones(p_factura_id bigint, p_imputaciones jsonb, p_user_id uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_imputable numeric(14,2);
  v_suma      numeric(14,2) := 0;
  v_n         int := 0;
  v_distintas int;
  r           record;
  v_obra      record;
begin
  select imputable into v_imputable from public.pagos_facturas where id = p_factura_id;
  if p_imputaciones is null or jsonb_typeof(p_imputaciones) <> 'array' or jsonb_array_length(p_imputaciones) = 0 then
    raise exception 'IMPUTACION_REQUERIDA' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text) loop
    if r.obra_cod is null or btrim(r.obra_cod) = '' or r.monto is null or r.monto <= 0 then
      raise exception 'IMPUTACION_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('obra_cod', r.obra_cod, 'monto', r.monto)::text;
    end if;
    select cod, coalesce(archivada, false) as archivada into v_obra from public.obras where cod = r.obra_cod;
    if not found then
      raise exception 'OBRA_INEXISTENTE' using errcode = 'P0001', detail = json_build_object('obra_cod', r.obra_cod)::text;
    end if;
    if v_obra.archivada then
      raise exception 'OBRA_ARCHIVADA' using errcode = 'P0001', detail = json_build_object('obra_cod', r.obra_cod)::text;
    end if;
    v_suma := v_suma + r.monto;
    v_n := v_n + 1;
  end loop;
  select count(distinct x.obra_cod) into v_distintas from jsonb_to_recordset(p_imputaciones) as x(obra_cod text);
  if v_distintas <> v_n then
    raise exception 'IMPUTACION_DUPLICADA' using errcode = 'P0001';
  end if;
  if abs(v_suma - v_imputable) > 0.01 then
    raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
      detail = json_build_object('suma', v_suma, 'imputable', v_imputable)::text;
  end if;
  delete from public.pagos_imputaciones where factura_id = p_factura_id;
  insert into public.pagos_imputaciones (factura_id, obra_cod, monto, obs, created_by, updated_by)
  select p_factura_id, x.obra_cod, round(x.monto, 2), coalesce(x.obs, ''), p_user_id, p_user_id
    from jsonb_to_recordset(p_imputaciones) as x(obra_cod text, monto numeric, obs text);
end $$;

-- LA regla de "qué se puede pagar": bloquea la factura y la devuelve.
create or replace function public._pagos_validar_pagable(p_factura_id bigint, p_proveedor_id bigint)
returns public.pagos_facturas language plpgsql set search_path = public, pg_temp as $$
declare v_f public.pagos_facturas%rowtype;
begin
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.proveedor_id <> p_proveedor_id then
    raise exception 'FACTURA_OTRO_PROVEEDOR' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'proveedor_id', v_f.proveedor_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado not in ('aprobada', 'pagada_parcial') then
    raise exception 'FACTURA_NO_APROBADA' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  return v_f;
end $$;

-- Emite una OP (orden + líneas + adjuntos). Compartida por pagos_registrar_orden
-- (p_exigir_aprobada = true) y pagos_crear_factura con "ya está pagada"
-- (p_exigir_aprobada = false: la factura recién nace y no pasa por aprobación).
create or replace function public._pagos_emitir_orden(p_proveedor_id bigint, p_orden jsonb, p_lineas jsonb, p_adjuntos jsonb, p_user_id uuid, p_exigir_aprobada boolean)
returns bigint language plpgsql set search_path = public, pg_temp as $$
declare
  v_prov        public.pagos_proveedores%rowtype;
  v_f           public.pagos_facturas%rowtype;
  v_es_admin    boolean;
  v_fecha       date;
  v_fecha_cobro date;
  v_forma       text;
  v_pagado      numeric(14,2) := 0;
  v_nc          numeric(14,2) := 0;
  v_cbu         text;
  v_alias       text;
  v_adjuntos    jsonb;
  v_numero      int;
  v_id          bigint;
  v_saldo       numeric(14,2);
  v_constraint  text;
  l             record;
  a             record;
  g             record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_es_admin := public._pagos_es_admin(p_user_id);
  select * into v_prov from public.pagos_proveedores where id = p_proveedor_id;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
  end if;

  v_fecha := (p_orden ->> 'fecha')::date;
  if v_fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  v_fecha_cobro := (p_orden ->> 'fecha_cobro')::date;
  v_forma := nullif(btrim(p_orden ->> 'forma_pago'), '');

  -- Líneas
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = 'P0001';
  end if;
  for l in select coalesce(x.tipo, 'factura') as tipo, x.factura_id, x.monto, nullif(btrim(x.nc_numero), '') as nc_numero, x.nc_fecha
             from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint, monto numeric, nc_numero text, nc_fecha date) loop
    if l.tipo not in ('factura', 'a_cuenta', 'nota_credito') or l.monto is null or l.monto <= 0
       or (l.tipo = 'a_cuenta') <> (l.factura_id is null) then
      raise exception 'LINEA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('tipo', l.tipo, 'factura_id', l.factura_id, 'monto', l.monto)::text;
    end if;
    if l.tipo = 'nota_credito' and (l.nc_numero is null or l.nc_fecha is null) then
      raise exception 'NC_DATOS_REQUERIDOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id)::text;
    end if;
    if l.tipo = 'nota_credito' then v_nc := v_nc + l.monto; else v_pagado := v_pagado + l.monto; end if;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint)
              where x.factura_id is not null group by x.factura_id, coalesce(x.tipo, 'factura') having count(*) > 1) then
    raise exception 'LINEA_DUPLICADA' using errcode = 'P0001';
  end if;

  -- Facturas: en orden de id (mismo orden en todas las RPC), aprobadas, del proveedor, con saldo.
  for g in select x.factura_id, sum(x.monto) as monto
             from jsonb_to_recordset(p_lineas) as x(factura_id bigint, monto numeric)
            where x.factura_id is not null group by x.factura_id order by x.factura_id loop
    if p_exigir_aprobada then
      select * into v_f from public._pagos_validar_pagable(g.factura_id, p_proveedor_id);
      if not v_es_admin and v_f.created_by = p_user_id then
        raise exception 'NO_PUEDE_PAGAR_PROPIA' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
      end if;
      if not v_es_admin and v_f.aprobada_por = p_user_id then
        raise exception 'NO_PUEDE_PAGAR_LO_QUE_APROBO' using errcode = 'P0001', detail = json_build_object('factura_id', g.factura_id)::text;
      end if;
    else
      select * into v_f from public.pagos_facturas where id = g.factura_id for update;
      if not found or v_f.proveedor_id <> p_proveedor_id or v_f.estado = 'anulada' or v_f.paga_cliente then
        raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
          detail = json_build_object('factura_id', g.factura_id, 'estado', v_f.estado)::text;
      end if;
    end if;
    select v_f.total - coalesce(sum(x.monto), 0) into v_saldo
      from public.pagos_orden_lineas x join public.pagos_ordenes o on o.id = x.orden_id
     where x.factura_id = g.factura_id and o.estado = 'emitida' and x.tipo in ('factura', 'nota_credito');
    if g.monto > v_saldo + 0.001 then
      raise exception 'MONTO_SUPERA_SALDO' using errcode = 'P0001',
        detail = json_build_object('factura_id', g.factura_id, 'saldo', v_saldo, 'monto', g.monto)::text;
    end if;
  end loop;

  if p_orden ? 'monto_pagado' and abs(coalesce((p_orden ->> 'monto_pagado')::numeric, 0) - v_pagado) > 0.01 then
    raise exception 'SUMA_LINEAS_DISTINTA' using errcode = 'P0001',
      detail = json_build_object('monto_pagado', (p_orden ->> 'monto_pagado')::numeric, 'suma', v_pagado)::text;
  end if;

  -- Forma: sin plata → nota_credito (y solo entonces).
  if v_pagado = 0 then
    if v_forma is null or v_forma = 'nota_credito' then v_forma := 'nota_credito';
    else raise exception 'FORMA_PAGO_INVALIDA' using errcode = 'P0001',
           detail = json_build_object('forma_pago', v_forma, 'monto_pagado', v_pagado)::text;
    end if;
  elsif v_forma is null or v_forma not in ('efectivo','transferencia','cheque','echeq','tarjeta','debito_automatico','otro') then
    raise exception 'FORMA_PAGO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'monto_pagado', v_pagado)::text;
  end if;
  if v_forma in ('cheque', 'echeq') and v_fecha_cobro is null then
    raise exception 'FECHA_COBRO_REQUERIDA' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
  end if;
  if v_fecha_cobro is not null and v_fecha_cobro < v_fecha then
    raise exception 'FECHA_COBRO_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('fecha', v_fecha, 'fecha_cobro', v_fecha_cobro)::text;
  end if;
  -- Cuenta destino: FOTO del padrón, el contador no la tipea.
  if v_forma in ('transferencia', 'debito_automatico') then
    if v_prov.cbu is null and v_prov.alias_cbu is null then
      raise exception 'PROVEEDOR_SIN_DATOS_PAGO' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
    end if;
    v_cbu := v_prov.cbu; v_alias := v_prov.alias_cbu;
  end if;

  -- Adjuntos: objeto o array; comprobante por forma solo si sale plata; NC exige su PDF.
  v_adjuntos := case when p_adjuntos is null or jsonb_typeof(p_adjuntos) = 'null' then '[]'::jsonb
                     when jsonb_typeof(p_adjuntos) = 'object' then jsonb_build_array(p_adjuntos)
                     else p_adjuntos end;
  for a in select * from jsonb_to_recordset(v_adjuntos) as x(tipo text, storage_path text, nombre_archivo text, hash_sha256 text, mime_type text, size_bytes bigint, obs text) loop
    if coalesce(a.tipo, '') not in ('comprobante_pago', 'nota_credito', 'otro') or coalesce(a.storage_path, '') = ''
       or coalesce(a.nombre_archivo, '') = '' or coalesce(a.hash_sha256, '') = '' or coalesce(a.mime_type, '') = ''
       or a.size_bytes is null or a.size_bytes <= 0 then
      raise exception 'ADJUNTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('tipo', a.tipo, 'storage_path', a.storage_path)::text;
    end if;
  end loop;
  if v_pagado > 0 and v_forma in ('transferencia', 'echeq')
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')::text;
  end if;
  if v_nc > 0 and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'nota_credito') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('forma_pago', 'nota_credito', 'tipo', 'nota_credito')::text;
  end if;

  -- Número al final, sin huecos por intentos fallidos.
  perform pg_advisory_xact_lock(hashtext('pagos_ordenes_numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pagos_ordenes;

  insert into public.pagos_ordenes (numero, proveedor_id, fecha, fecha_cobro, forma_pago, referencia, cbu_destino, alias_destino,
                                    monto_pagado, monto_nc, obs, created_by, updated_by)
  values (v_numero, p_proveedor_id, v_fecha, v_fecha_cobro, v_forma, coalesce(p_orden ->> 'referencia', ''), v_cbu, v_alias,
          v_pagado, v_nc, coalesce(p_orden ->> 'obs', ''), p_user_id, p_user_id)
  returning id into v_id;

  insert into public.pagos_orden_lineas (orden_id, tipo, factura_id, monto, nc_numero, nc_fecha)
  select v_id, coalesce(x.tipo, 'factura'), x.factura_id, round(x.monto, 2),
         case when coalesce(x.tipo, 'factura') = 'nota_credito' then nullif(btrim(x.nc_numero), '') end,
         case when coalesce(x.tipo, 'factura') = 'nota_credito' then x.nc_fecha end
    from jsonb_array_elements(p_lineas) with ordinality as e(v, n)
    cross join lateral jsonb_to_record(e.v) as x(tipo text, factura_id bigint, monto numeric, nc_numero text, nc_fecha date)
   order by e.n;

  begin
    insert into public.pagos_ordenes_adjuntos (orden_id, tipo, storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, obs, created_by, updated_by)
    select v_id, x.tipo, x.storage_path, x.nombre_archivo, x.hash_sha256, x.mime_type, x.size_bytes, coalesce(x.obs, ''), p_user_id, p_user_id
      from jsonb_to_recordset(v_adjuntos) as x(tipo text, storage_path text, nombre_archivo text, hash_sha256 text, mime_type text, size_bytes bigint, obs text);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception 'ADJ_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('entidad', 'orden', 'orden_id', v_id, 'constraint', v_constraint)::text;
  end;
  return v_id;
end $$;

-- ── RPCs públicas (solo service_role) ─────────────────────────────────

-- Alta de factura (+ imputaciones) y, si p_orden viene, la OP de "ya está pagada".
create or replace function public.pagos_crear_factura(p_factura jsonb, p_imputaciones jsonb, p_user_id uuid, p_orden jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prov        public.pagos_proveedores%rowtype;
  v_id          bigint;
  v_orden_id    bigint;
  v_numero      text;
  v_numero_norm text;
  v_fecha       date;
  v_vence       date;
  v_total       numeric(14,2);
  v_paga_cli    boolean;
  v_pac         boolean := false;
  v_forma       text;
  v_constraint  text;
  v_existente   bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_prov from public.pagos_proveedores where id = (p_factura ->> 'proveedor_id')::bigint;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_factura ->> 'proveedor_id')::text;
  end if;
  if not v_prov.activo then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_prov.id)::text;
  end if;
  v_numero := nullif(btrim(coalesce(p_factura ->> 'numero', '')), '');
  v_numero_norm := case when v_numero is null then null
                        else coalesce(nullif(btrim(coalesce(p_factura ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end;
  v_fecha := (p_factura ->> 'fecha')::date;
  if v_fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  v_total := (p_factura ->> 'total')::numeric;
  if v_total is null or v_total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', p_factura ->> 'total')::text;
  end if;
  v_vence := (p_factura ->> 'vence_el')::date;
  if v_vence is not null and v_vence < v_fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'vence_el', v_vence)::text;
  end if;
  if length(btrim(coalesce(p_factura ->> 'descripcion', ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
  perform public._pagos_validar_desglose((p_factura ->> 'neto')::numeric, (p_factura ->> 'iva')::numeric,
                                         (p_factura ->> 'percepciones')::numeric, (p_factura ->> 'otros')::numeric, v_total);
  v_paga_cli := coalesce((p_factura ->> 'paga_cliente')::boolean, false);
  if p_orden is not null and jsonb_typeof(p_orden) = 'object' then
    if v_paga_cli then
      raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001';
    end if;
    v_forma := nullif(btrim(p_orden ->> 'forma_pago'), '');
    if not public._pagos_es_admin(p_user_id) and coalesce(v_forma, '') not in ('tarjeta', 'efectivo') then
      raise exception 'PAGADA_AL_CARGAR_FORMA' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
    end if;
    v_pac := true;
    v_vence := null;          -- una pagada no vence
  end if;

  begin
    insert into public.pagos_facturas (proveedor_id, tipo_comprobante, numero, numero_norm, fecha, vence_el, neto, iva, percepciones, otros, total,
                                       forma_pago_prevista, paga_cliente, pagada_al_cargar, descripcion, obs, created_by, updated_by)
    values (v_prov.id, p_factura ->> 'tipo_comprobante', v_numero, v_numero_norm, v_fecha, v_vence,
            (p_factura ->> 'neto')::numeric, (p_factura ->> 'iva')::numeric, (p_factura ->> 'percepciones')::numeric, (p_factura ->> 'otros')::numeric, v_total,
            coalesce(nullif(p_factura ->> 'forma_pago_prevista', ''), 'transferencia'), v_paga_cli, v_pac,
            btrim(p_factura ->> 'descripcion'), coalesce(p_factura ->> 'obs', ''), p_user_id, p_user_id)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
      select id into v_existente from public.pagos_facturas
       where proveedor_id = v_prov.id and tipo_comprobante = p_factura ->> 'tipo_comprobante'
         and numero_norm = v_numero_norm and estado <> 'anulada' limit 1;
      raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
    end if;
    raise;
  end;

  perform public._pagos_reemplazar_imputaciones(v_id, p_imputaciones, p_user_id);

  if v_pac then
    v_orden_id := public._pagos_emitir_orden(
      v_prov.id, p_orden,
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', v_id, 'monto', v_total)),
      coalesce(p_orden -> 'adjuntos', p_orden -> 'comprobante'),
      p_user_id, false);
  end if;

  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = v_id),
    'orden',   case when v_orden_id is null then null else (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_orden_id) end);
end $$;

-- Edición: SOLO las claves presentes en p_cambios van al SET (así los triggers
-- de congelado/desaprobación ven lo que de verdad cambió).
create or replace function public.pagos_editar_factura(p_factura_id bigint, p_cambios jsonb, p_imputaciones jsonb, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f           public.pagos_facturas%rowtype;
  v_new         public.pagos_facturas%rowtype;
  v_cambios     jsonb := coalesce(p_cambios, '{}'::jsonb);
  v_estado_antes text;
  v_tiene_pagos boolean;
  v_k           text;
  v_sets        text[] := '{}';
  v_congelados  text[] := '{}';
  v_numero      text;
  v_constraint  text;
  v_existente   bigint;
  v_suma        numeric(14,2);
  v_n           int;
  v_permitidos  text[] := array['proveedor_id','tipo_comprobante','numero','numero_norm','fecha','vence_el','neto','iva',
                                'percepciones','otros','total','forma_pago_prevista','paga_cliente','descripcion','obs'];
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  v_estado_antes := v_f.estado;
  select exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
                  where l.factura_id = p_factura_id and o.estado = 'emitida') into v_tiene_pagos;

  for v_k in select jsonb_object_keys(v_cambios) loop
    if v_k <> all(v_permitidos) then
      raise exception 'CAMPO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;
  -- numero_norm solo acompaña a numero (fallback norm_txt si el backend no lo mandó).
  if v_cambios ? 'numero' then
    v_numero := nullif(btrim(coalesce(v_cambios ->> 'numero', '')), '');
    v_cambios := v_cambios || jsonb_build_object(
      'numero', v_numero,
      'numero_norm', case when v_numero is null then null
                          else coalesce(nullif(btrim(coalesce(v_cambios ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end);
  else
    v_cambios := v_cambios - 'numero_norm';
  end if;

  v_new := jsonb_populate_record(v_f, v_cambios);   -- fila fusionada (lo ausente queda como estaba)

  if v_cambios ? 'proveedor_id' and v_new.proveedor_id is distinct from v_f.proveedor_id then
    if not exists (select 1 from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
    if not (select activo from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
  end if;
  if v_tiene_pagos then
    if v_new.proveedor_id is distinct from v_f.proveedor_id then v_congelados := array_append(v_congelados, 'proveedor_id'); end if;
    if v_new.fecha is distinct from v_f.fecha then v_congelados := array_append(v_congelados, 'fecha'); end if;
    if v_new.neto is distinct from v_f.neto then v_congelados := array_append(v_congelados, 'neto'); end if;
    if v_new.iva is distinct from v_f.iva then v_congelados := array_append(v_congelados, 'iva'); end if;
    if v_new.percepciones is distinct from v_f.percepciones then v_congelados := array_append(v_congelados, 'percepciones'); end if;
    if v_new.otros is distinct from v_f.otros then v_congelados := array_append(v_congelados, 'otros'); end if;
    if v_new.total is distinct from v_f.total then v_congelados := array_append(v_congelados, 'total'); end if;
    if v_new.paga_cliente is distinct from v_f.paga_cliente then v_congelados := array_append(v_congelados, 'paga_cliente'); end if;
    if array_length(v_congelados, 1) > 0 then
      raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'campos', to_json(v_congelados))::text;
    end if;
  end if;
  if v_new.fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_new.fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'hoy', public.hoy_ar())::text;
  end if;
  if v_new.total is null or v_new.total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', v_new.total)::text;
  end if;
  if v_new.vence_el is not null and v_new.vence_el < v_new.fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'vence_el', v_new.vence_el)::text;
  end if;
  if length(btrim(coalesce(v_new.descripcion, ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
  perform public._pagos_validar_desglose(v_new.neto, v_new.iva, v_new.percepciones, v_new.otros, v_new.total);

  if jsonb_typeof(v_cambios) = 'object' and (select count(*) from jsonb_object_keys(v_cambios)) > 0 then
    for v_k in select jsonb_object_keys(v_cambios) loop
      v_sets := v_sets || format('%I = ($2).%I', v_k, v_k);
    end loop;
    begin
      execute format('update public.pagos_facturas set %s, updated_by = $3 where id = $1', array_to_string(v_sets, ', '))
        using p_factura_id, v_new, p_user_id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
        select id into v_existente from public.pagos_facturas
         where proveedor_id = v_new.proveedor_id and tipo_comprobante = v_new.tipo_comprobante
           and numero_norm = v_new.numero_norm and estado <> 'anulada' and id <> p_factura_id limit 1;
        raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
      end if;
      raise;
    end;
  end if;

  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    if v_estado_antes in ('pagada', 'pagada_parcial') and length(btrim(coalesce(p_motivo, ''))) < 3 then
      raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
    end if;
    perform public._pagos_reemplazar_imputaciones(p_factura_id, p_imputaciones, p_user_id);
    if length(btrim(coalesce(p_motivo, ''))) >= 3 then
      update public.pagos_facturas
         set obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — reimputada: ' || btrim(p_motivo)), updated_by = p_user_id
       where id = p_factura_id;
    end if;
  else
    -- Cambió imputable y no vino reparto: una sola obra se ajusta sola; varias → hay que reimputar.
    select coalesce(sum(monto), 0), count(*) into v_suma, v_n from public.pagos_imputaciones where factura_id = p_factura_id;
    select imputable into v_new.imputable from public.pagos_facturas where id = p_factura_id;
    if abs(v_suma - v_new.imputable) > 0.01 then
      if v_n = 1 then
        update public.pagos_imputaciones set monto = v_new.imputable, updated_by = p_user_id where factura_id = p_factura_id;
      else
        raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
          detail = json_build_object('suma', v_suma, 'imputable', v_new.imputable)::text;
      end if;
    end if;
  end if;

  select * into v_f from public.pagos_facturas where id = p_factura_id;
  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id),
    'aprobacion_retirada', (v_estado_antes = 'aprobada' and v_f.estado = 'pendiente'));
end $$;

-- Aprobar una (pendiente → aprobada) o sellar una "pagada al cargar".
create or replace function public.pagos_aprobar_factura(p_factura_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f        public.pagos_facturas%rowtype;
  v_es_admin boolean;
  v_activo   boolean;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_es_admin := public._pagos_es_admin(p_user_id);
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select activo into v_activo from public.pagos_proveedores where id = v_f.proveedor_id;
  if not coalesce(v_activo, false) then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_f.proveedor_id)::text;
  end if;
  if not v_es_admin and v_f.created_by = p_user_id then
    raise exception 'NO_PUEDE_APROBAR_PROPIA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'pendiente' then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set estado = 'aprobada', aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  elsif v_f.estado = 'pagada' and v_f.pagada_al_cargar and v_f.aprobada_at is null then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  else
    raise exception 'FACTURA_NO_APROBABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $$;

-- Lote: aplica las que puede y devuelve las omitidas con su código. No es
-- transaccional a propósito (una propia en el lote no frena a las demás).
create or replace function public.pagos_aprobar_facturas(p_ids bigint[], p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        bigint;
  v_ids       bigint[];
  v_aprobadas bigint[] := '{}';
  v_omitidas  jsonb := '[]'::jsonb;
  v_code      text;
  v_detail    text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'IDS_REQUERIDOS' using errcode = 'P0001';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_ids) x;
  foreach v_id in array v_ids loop
    begin
      perform public.pagos_aprobar_factura(v_id, p_user_id);
      v_aprobadas := v_aprobadas || v_id;
    exception when others then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      v_omitidas := v_omitidas || jsonb_build_object('id', v_id, 'code', v_code,
                                                     'detail', case when v_detail like '{%' then v_detail::jsonb else to_jsonb(nullif(v_detail, '')) end);
    end;
  end loop;
  return jsonb_build_object('aprobadas', to_jsonb(v_aprobadas), 'omitidas', v_omitidas);
end $$;

-- Observar (= rechazar con motivo): solo desde pendiente/aprobada.
create or replace function public.pagos_observar_factura(p_factura_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f public.pagos_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado in ('pagada_parcial', 'pagada') then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  if v_f.estado = 'observada' then
    raise exception 'FACTURA_NO_OBSERVABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  update public.pagos_facturas
     set estado = 'observada', motivo_observacion = btrim(p_motivo), observada_por = p_user_id, observada_at = now(),
         aprobada_por = null, aprobada_at = null, updated_by = p_user_id
   where id = p_factura_id;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $$;

-- Compras corrigió: observada → pendiente (nunca a aprobada).
create or replace function public.pagos_marcar_corregida(p_factura_id bigint, p_comentario text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f public.pagos_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado <> 'observada' then
    raise exception 'FACTURA_NO_OBSERVADA' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  update public.pagos_facturas
     set estado = 'pendiente', motivo_observacion = null, updated_by = p_user_id,
         obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — corregida'
                     || case when length(btrim(coalesce(p_comentario, ''))) > 0 then ': ' || btrim(p_comentario) else '' end)
   where id = p_factura_id;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $$;

-- Anular factura sin pagos vigentes.
create or replace function public.pagos_anular_factura(p_factura_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f public.pagos_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
              where l.factura_id = p_factura_id and o.estado = 'emitida') then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  update public.pagos_facturas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo), anulado_por = p_user_id, anulado_at = now(),
         aprobada_por = null, aprobada_at = null, updated_by = p_user_id
   where id = p_factura_id;
  update public.pagos_facturas_adjuntos set deleted_at = now(), updated_by = p_user_id
   where factura_id = p_factura_id and deleted_at is null;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $$;

-- Anular una OP: las facturas vuelven a aprobada (si aprobada_at sigue) o a pendiente.
create or replace function public.pagos_anular_orden(p_orden_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.pagos_ordenes%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_o from public.pagos_ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'ORDEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;
  if v_o.estado = 'anulada' then
    raise exception 'ORDEN_YA_ANULADA' using errcode = 'P0001', detail = json_build_object('orden_id', p_orden_id)::text;
  end if;
  perform 1 from public.pagos_facturas f
    where f.id in (select l.factura_id from public.pagos_orden_lineas l where l.orden_id = p_orden_id and l.factura_id is not null)
    order by f.id for update;
  update public.pagos_ordenes
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo), anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
   where id = p_orden_id;                                   -- trg_pagos_orden_recalc recalcula cada factura
  update public.pagos_ordenes_adjuntos set deleted_at = now(), updated_by = p_user_id
   where orden_id = p_orden_id and deleted_at is null;
  return jsonb_build_object(
    'orden', (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = p_orden_id),
    'facturas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.v_pagos_facturas v
                  where v.id in (select l.factura_id from public.pagos_orden_lineas l where l.orden_id = p_orden_id)));
end $$;

-- Rechazar/anular una "pagada al cargar": anula su OP y después la factura.
create or replace function public.pagos_anular_pagada_al_cargar(p_factura_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f      public.pagos_facturas%rowtype;
  v_o      public.pagos_ordenes%rowtype;
  v_n      int;
  v_lineas int;
  v_ok     boolean;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if not v_f.pagada_al_cargar then
    raise exception 'PAGADA_AL_CARGAR_NO_ANULABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'motivo', 'no_es_pagada_al_cargar')::text;
  end if;
  select count(distinct o.id) into v_n
    from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
   where l.factura_id = p_factura_id and o.estado = 'emitida';
  if v_n = 0 then
    return jsonb_build_object('factura', public.pagos_anular_factura(p_factura_id, p_motivo, p_user_id), 'orden', null);
  end if;
  if v_n > 1 then
    raise exception 'PAGADA_AL_CARGAR_NO_ANULABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'motivo', 'varias_op_vigentes')::text;
  end if;
  select o.* into v_o
    from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
   where l.factura_id = p_factura_id and o.estado = 'emitida' limit 1;
  select count(*), bool_and(l.tipo = 'factura' and l.factura_id = p_factura_id and l.monto = v_f.total)
    into v_lineas, v_ok from public.pagos_orden_lineas l where l.orden_id = v_o.id;
  if v_lineas <> 1 or not v_ok or v_o.created_at <> v_f.created_at then
    raise exception 'PAGADA_AL_CARGAR_NO_ANULABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'orden_id', v_o.id, 'motivo', 'op_no_es_la_original')::text;
  end if;
  perform public.pagos_anular_orden(v_o.id, 'rechazo/anulación de factura pagada al cargar: ' || btrim(p_motivo), p_user_id);
  perform public.pagos_anular_factura(p_factura_id, p_motivo, p_user_id);
  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id),
    'orden',   (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_o.id));
end $$;

-- Registrar una orden de pago (contador). Todo o nada.
--   p_orden:    { proveedor_id, fecha, forma_pago, fecha_cobro?, referencia?, obs?, monto_pagado? (cross-check) }
--   p_lineas:   [{ tipo: 'factura'|'a_cuenta'|'nota_credito', factura_id?, monto, nc_numero?, nc_fecha? }]
--   p_adjuntos: objeto o array de { tipo: 'comprobante_pago'|'nota_credito'|'otro', storage_path, nombre_archivo, hash_sha256, mime_type, size_bytes, obs? } | null
create or replace function public.pagos_registrar_orden(p_orden jsonb, p_lineas jsonb, p_adjuntos jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prov_id bigint;
  v_id      bigint;
begin
  v_prov_id := (p_orden ->> 'proveedor_id')::bigint;
  if v_prov_id is null then raise exception 'PROVEEDOR_REQUERIDO' using errcode = 'P0001'; end if;
  v_id := public._pagos_emitir_orden(v_prov_id, p_orden, p_lineas, p_adjuntos, p_user_id, true);
  return jsonb_build_object(
    'orden', (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_id),
    'facturas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from public.v_pagos_facturas v
                  where v.id in (select l.factura_id from public.pagos_orden_lineas l where l.orden_id = v_id)));
end $$;

-- Resumen de facturas (eje emisión). Para obra / centro_costo prorratea por imputación, sin redondear.
create or replace function public.pagos_resumen(
  p_grupo text, p_proveedor_id bigint default null, p_obra_cod text default null, p_centro_costo text default null,
  p_estados text[] default null, p_tipo text default null, p_forma_pago text default null, p_vencimiento text default null,
  p_desde date default null, p_hasta date default null, p_palabras text[] default null,
  p_archivadas boolean default false, p_paga_cliente boolean default null)
returns table (grupo text, grupo_nom text, es_interna boolean, estado text, facturas int, total numeric, imputable numeric,
               pagado numeric, acreditado numeric, saldo numeric, saldo_aprobado numeric, vencido numeric, ultimo date)
language sql stable security definer set search_path = public, pg_temp as $$
  with f as (
    select v.* from public.v_pagos_facturas v
     where (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
       and (p_obra_cod is null or p_obra_cod = any(v.obras_cod))
       and (p_centro_costo is null or p_centro_costo = any(v.centros_cc))
       and (p_estados is null or v.estado = any(p_estados))
       and (p_tipo is null or v.tipo_comprobante = p_tipo)
       and (p_forma_pago is null or v.forma_pago_prevista = p_forma_pago)
       and (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
       and (p_paga_cliente is null or v.paga_cliente = p_paga_cliente)
       and (coalesce(p_archivadas, false) or not coalesce(v.todas_archivadas, false))
       and (p_palabras is null or (select bool_and(v.busq like '%' || w || '%') from unnest(p_palabras) w))
       and (p_vencimiento is null or p_vencimiento = 'todas'
            or (p_vencimiento = 'vencidas' and v.vencida)
            or (p_vencimiento in ('7', '30') and v.saldo > 0 and v.estado in ('pendiente','observada','aprobada','pagada_parcial')
                and v.vence_el is not null
                and v.vence_el <= public.hoy_ar() + (case when p_vencimiento in ('7', '30') then p_vencimiento::int else 0 end)))
  ), g as (
    select f.id, f.estado, f.total, f.imputable, f.pagado, f.acreditado, f.saldo, f.vencida, f.fecha, f.paga_cliente,
           case when im.obra_cod is null then 1 else im.monto / nullif(f.imputable, 0) end as factor,
           case p_grupo
             when 'proveedor'    then f.proveedor_id::text
             when 'centro_costo' then im.centro
             when 'obra'         then im.obra_cod
             when 'mes_emision'  then f.mes_emision
             when 'estado'       then case when f.paga_cliente then 'paga_cliente' else f.estado end
             when 'forma_pago'   then f.forma_pago_prevista
             when 'vencimiento'  then case when f.saldo <= 0 or f.estado in ('pagada','anulada') then 'sin_saldo'
                                           when f.vence_el is null then 'sin_vencimiento'
                                           when f.vencida then 'vencida'
                                           when f.vence_el <= public.hoy_ar() + 7 then 'vence_7'
                                           when f.vence_el <= public.hoy_ar() + 30 then 'vence_30'
                                           else 'mas_adelante' end
           end as grupo,
           case p_grupo
             when 'proveedor'    then f.proveedor_nom
             when 'centro_costo' then im.centro
             when 'obra'         then im.nom
             when 'estado'       then case when f.paga_cliente then 'Pagó el cliente' else f.estado end
             else null end as grupo_nom,
           case when p_grupo in ('obra', 'centro_costo') then (im.es_interna or im.es_deposito) else null end as es_interna
      from f
      left join lateral (
        select i.obra_cod, i.monto, o.nom, o.es_interna, o.es_deposito,
               public._pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) as centro
          from public.pagos_imputaciones i join public.obras o on o.cod = i.obra_cod
         where p_grupo in ('obra', 'centro_costo') and i.factura_id = f.id) im on true
  )
  select g.grupo, coalesce(max(g.grupo_nom), g.grupo) as grupo_nom, bool_or(g.es_interna) as es_interna,
         case when p_grupo = 'estado' then g.grupo else null end as estado,
         count(distinct g.id)::int as facturas,
         sum(g.total * g.factor) as total, sum(g.imputable * g.factor) as imputable,
         sum(g.pagado * g.factor) as pagado, sum(g.acreditado * g.factor) as acreditado,
         sum(g.saldo * g.factor) as saldo,
         sum(g.saldo * g.factor) filter (where g.estado in ('aprobada', 'pagada_parcial') and not g.paga_cliente) as saldo_aprobado,
         sum(g.saldo * g.factor) filter (where g.vencida) as vencido,
         max(g.fecha) as ultimo
    from g
   where g.grupo is not null
   group by g.grupo
  union all
  select 'sin_revisar', 'Sin revisar', null, 'sin_revisar', count(*)::int, sum(f.total), sum(f.imputable),
         sum(f.pagado), sum(f.acreditado), sum(f.saldo), 0, 0, max(f.fecha)
    from f where p_grupo = 'estado' and f.sin_revisar
  having count(*) > 0
$$;

-- Resumen de órdenes (eje FECHA DE PAGO): 'op' = fecha de la OP, 'cobro' = coalesce(fecha_cobro, fecha).
create or replace function public.pagos_ordenes_resumen(
  p_grupo text, p_eje text default 'op', p_desde date default null, p_hasta date default null,
  p_proveedor_id bigint default null, p_forma_pago text default null)
returns table (grupo text, grupo_nom text, es_interna boolean, ordenes int, monto_pagado numeric, monto_nc numeric,
               a_cuenta numeric, en_cartera numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with o as (
    select o.*, case when p_eje = 'cobro' then coalesce(o.fecha_cobro, o.fecha) else o.fecha end as eje_fecha,
           p.razon_social as proveedor_nom
      from public.pagos_ordenes o join public.pagos_proveedores p on p.id = o.proveedor_id
     where o.estado = 'emitida'
       and (p_proveedor_id is null or o.proveedor_id = p_proveedor_id)
       and (p_forma_pago is null or o.forma_pago = p_forma_pago)
  ), o2 as (
    select * from o where (p_desde is null or o.eje_fecha >= p_desde) and (p_hasta is null or o.eje_fecha <= p_hasta)
  ), l as (
    -- una fila por línea (prorrateada a las imputaciones de su factura si el grupo es obra/centro_costo)
    select o2.id as orden_id, o2.proveedor_id, o2.proveedor_nom, o2.forma_pago, o2.eje_fecha, o2.fecha_cobro,
           ln.tipo, ln.monto * coalesce(im.factor, 1) as monto,
           case p_grupo
             when 'mes_pago'     then to_char(o2.eje_fecha, 'YYYY-MM')
             when 'proveedor'    then o2.proveedor_id::text
             when 'forma_pago'   then o2.forma_pago
             when 'centro_costo' then case when ln.tipo = 'a_cuenta' then 'a_cuenta' else im.centro end
             when 'obra'         then case when ln.tipo = 'a_cuenta' then 'a_cuenta' else im.obra_cod end
           end as grupo,
           case p_grupo
             when 'proveedor'    then o2.proveedor_nom
             when 'centro_costo' then case when ln.tipo = 'a_cuenta' then 'A cuenta (sin factura)' else im.centro end
             when 'obra'         then case when ln.tipo = 'a_cuenta' then 'A cuenta (sin factura)' else im.nom end
             else null end as grupo_nom,
           case when p_grupo in ('obra', 'centro_costo') and ln.tipo <> 'a_cuenta' then (im.es_interna or im.es_deposito) else null end as es_interna
      from o2
      join public.pagos_orden_lineas ln on ln.orden_id = o2.id
      left join lateral (
        select i.obra_cod, o.nom, o.es_interna, o.es_deposito, i.monto / nullif(f.imputable, 0) as factor,
               public._pagos_centro_de(o.cc, o.nom, o.es_interna, o.es_deposito) as centro
          from public.pagos_imputaciones i join public.obras o on o.cod = i.obra_cod join public.pagos_facturas f on f.id = i.factura_id
         where p_grupo in ('obra', 'centro_costo') and i.factura_id = ln.factura_id) im on true
  )
  select l.grupo, coalesce(max(l.grupo_nom), l.grupo) as grupo_nom, bool_or(l.es_interna) as es_interna,
         count(distinct l.orden_id)::int as ordenes,
         coalesce(sum(l.monto) filter (where l.tipo in ('factura', 'a_cuenta')), 0) as monto_pagado,
         coalesce(sum(l.monto) filter (where l.tipo = 'nota_credito'), 0) as monto_nc,
         coalesce(sum(l.monto) filter (where l.tipo = 'a_cuenta'), 0) as a_cuenta,
         coalesce(sum(l.monto) filter (where l.tipo in ('factura', 'a_cuenta') and l.fecha_cobro is not null and l.fecha_cobro > public.hoy_ar()), 0) as en_cartera
    from l
   where l.grupo is not null
   group by l.grupo
$$;

-- ── Grants ────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_pagos_centro_de(text, text, boolean, boolean)',
    '_pagos_es_admin(uuid)',
    '_pagos_validar_desglose(numeric, numeric, numeric, numeric, numeric)',
    '_pagos_reemplazar_imputaciones(bigint, jsonb, uuid)',
    '_pagos_validar_pagable(bigint, bigint)',
    '_pagos_emitir_orden(bigint, jsonb, jsonb, jsonb, uuid, boolean)',
    'pagos_crear_factura(jsonb, jsonb, uuid, jsonb)',
    'pagos_editar_factura(bigint, jsonb, jsonb, text, uuid)',
    'pagos_aprobar_factura(bigint, uuid)',
    'pagos_aprobar_facturas(bigint[], uuid)',
    'pagos_observar_factura(bigint, text, uuid)',
    'pagos_marcar_corregida(bigint, text, uuid)',
    'pagos_anular_factura(bigint, text, uuid)',
    'pagos_anular_orden(bigint, text, uuid)',
    'pagos_anular_pagada_al_cargar(bigint, text, uuid)',
    'pagos_registrar_orden(jsonb, jsonb, jsonb, uuid)',
    'pagos_resumen(text, bigint, text, text, text[], text, text, text, date, date, text[], boolean, boolean)',
    'pagos_ordenes_resumen(text, text, date, date, bigint, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── Bloque funcional (se deshace solo) ────────────────────────────────
-- Ejerce el circuito entero con usuarios reales de profiles (un admin y tres
-- operadores) y termina en `raise exception 'ROLLBACK_OK …'`, que el bloque
-- externo atrapa: la subtransacción se deshace y la base queda intacta. Si un
-- paso falla, el error sube y la migración aborta.
do $t$
declare
  v_admin uuid; v_a uuid; v_b uuid; v_c uuid;
  v_obra1 text; v_obra2 text;
  v_prov bigint; v_prov2 bigint;
  v_f1 bigint; v_f2 bigint; v_f3 bigint; v_f4 bigint; v_f5 bigint; v_f6 bigint;
  v_obra_int_cc text; v_nom_int text; v_cc_int text;
  v_op bigint; v_op2 bigint; v_op4 bigint;
  v_r jsonb; v_r2 jsonb;
  v_estado text; v_saldo numeric; v_aprobada_por uuid; v_pagado numeric; v_acreditado numeric;
  v_cbu text := '0170099220000067797370';
  v_ok text[] := '{}';
  v_info text;
begin
  begin
    select id into v_admin from public.profiles where rol = 'admin' and activo order by created_at limit 1;
    select array_agg(id::text order by created_at) into strict v_ok from (
      select id, created_at from public.profiles where rol <> 'admin' and activo and id in (select id from auth.users)
       order by created_at limit 3) x;
    if v_admin is null or coalesce(array_length(v_ok, 1), 0) < 3 then
      raise exception 'TEST_SIN_USUARIOS';
    end if;
    v_a := v_ok[1]::uuid; v_b := v_ok[2]::uuid; v_c := v_ok[3]::uuid; v_ok := '{}';
    select cod into v_obra1 from public.obras where not coalesce(archivada, false) and es_interna order by cod limit 1;
    select cod into v_obra2 from public.obras where not coalesce(archivada, false) and not es_interna and not es_deposito order by cod limit 1;

    -- Proveedores: el segundo con el mismo CUIT rebota; el CBU inválido rebota.
    insert into public.pagos_proveedores (razon_social, cuit, cbu, alias_cbu, created_by) values ('Silva Hnos SRL', '30577428618', v_cbu, 'silva.hnos', v_a) returning id into v_prov;
    begin
      insert into public.pagos_proveedores (razon_social, cuit) values ('Silva otra vez', '30577428618');
      raise exception 'TEST_FALLO: cuit repetido no rebotó';
    exception when unique_violation then v_ok := array_append(v_ok, 'cuit_unico'); end;
    begin
      insert into public.pagos_proveedores (razon_social, cbu) values ('CBU malo', '0170099220000067797371');
      raise exception 'TEST_FALLO: cbu inválido no rebotó';
    exception when check_violation then v_ok := array_append(v_ok, 'cbu_check'); end;
    insert into public.pagos_proveedores (razon_social, created_by) values ('Sin datos de pago SA', v_a) returning id into v_prov2;
    if (select razon_social_norm from public.pagos_proveedores where id = v_prov) <> 'silva hnos srl' then raise exception 'TEST_FALLO: norm'; end if;

    -- Facturas: F1 y F2 de A (compras), F3 de B (Diego carga y aprueba).
    v_r := public.pagos_crear_factura(
      jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'A', 'numero', '0012-00007526', 'numero_norm', '12-7526',
                         'fecha', public.hoy_ar() - 10, 'vence_el', public.hoy_ar() - 1, 'total', 100000, 'neto', 82644.63, 'iva', 17355.37,
                         'descripcion', 'Hierro 8 mm x 40 barras'),
      jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 60000), jsonb_build_object('obra_cod', v_obra2, 'monto', 40000)),
      v_a);
    v_f1 := (v_r -> 'factura' ->> 'id')::bigint;
    if (v_r -> 'factura' ->> 'estado') <> 'pendiente' or (v_r -> 'factura' ->> 'saldo')::numeric <> 100000 then raise exception 'TEST_FALLO: F1 %', v_r; end if;
    begin
      perform public.pagos_crear_factura(jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'A', 'numero', 'FC A 12-7526', 'numero_norm', '12-7526',
                         'fecha', public.hoy_ar(), 'total', 5, 'descripcion', 'duplicada'), jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 5)), v_a);
      raise exception 'TEST_FALLO: duplicada no rebotó';
    exception when others then if sqlerrm <> 'FACTURA_DUPLICADA' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_DUPLICADA'); end;
    begin
      perform public.pagos_crear_factura(jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'B', 'fecha', public.hoy_ar(), 'total', 100, 'descripcion', 'no cuadra'),
                                         jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 90)), v_a);
      raise exception 'TEST_FALLO: imputación no cuadra no rebotó';
    exception when others then if sqlerrm <> 'IMPUTACION_NO_CUADRA' then raise; end if; v_ok := array_append(v_ok, 'IMPUTACION_NO_CUADRA'); end;
    v_r := public.pagos_crear_factura(
      jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'B', 'numero', '3-100', 'fecha', public.hoy_ar() - 5, 'total', 50000, 'descripcion', 'Cemento 20 bolsas'),
      jsonb_build_array(jsonb_build_object('obra_cod', v_obra2, 'monto', 50000)), v_a);
    v_f2 := (v_r -> 'factura' ->> 'id')::bigint;
    v_r := public.pagos_crear_factura(
      jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'C', 'fecha', public.hoy_ar() - 2, 'total', 30000, 'descripcion', 'Flete'),
      jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 30000)), v_b);
    v_f3 := (v_r -> 'factura' ->> 'id')::bigint;

    -- Pagar una pendiente rebota.
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'efectivo'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100000)), null, v_c);
      raise exception 'TEST_FALLO: pendiente pagable';
    exception when others then if sqlerrm <> 'FACTURA_NO_APROBADA' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_NO_APROBADA'); end;

    -- Aprobación: A no aprueba lo suyo; B aprueba F1+F2 en lote y F3 (suya) sale omitida; el admin aprueba F3.
    begin
      perform public.pagos_aprobar_factura(v_f1, v_a);
      raise exception 'TEST_FALLO: aprobó la propia';
    exception when others then if sqlerrm <> 'NO_PUEDE_APROBAR_PROPIA' then raise; end if; v_ok := array_append(v_ok, 'NO_PUEDE_APROBAR_PROPIA'); end;
    v_r := public.pagos_aprobar_facturas(array[v_f1, v_f2, v_f3], v_b);
    if jsonb_array_length(v_r -> 'aprobadas') <> 2 or (v_r -> 'omitidas' -> 0 ->> 'code') <> 'NO_PUEDE_APROBAR_PROPIA' then raise exception 'TEST_FALLO: lote %', v_r; end if;
    v_ok := array_append(v_ok, 'lote_aprobadas_2_omitida_1');
    perform public.pagos_aprobar_factura(v_f3, v_admin);
    if (select estado from public.pagos_facturas where id = v_f3) <> 'aprobada' then raise exception 'TEST_FALLO: admin aprueba'; end if;

    -- Guards a mano: estado='aprobada', aprobada_por y estado='pagada' rebotan.
    begin
      update public.pagos_facturas set estado = 'aprobada' where id = v_f1;   -- ya está aprobada: probamos sobre F4 más abajo también
      update public.pagos_facturas set aprobada_por = v_admin where id = v_f1;
      raise exception 'TEST_FALLO: aprobada_por a mano';
    exception when others then if sqlerrm <> 'APROBACION_SOLO_RPC' then raise; end if; v_ok := array_append(v_ok, 'APROBACION_SOLO_RPC(aprobada_por)'); end;
    begin
      update public.pagos_facturas set estado = 'pagada' where id = v_f1;
      raise exception 'TEST_FALLO: pagada a mano';
    exception when others then if sqlerrm <> 'ESTADO_SOLO_RECALCULADOR' then raise; end if; v_ok := array_append(v_ok, 'ESTADO_SOLO_RECALCULADOR'); end;

    -- Separación de funciones al pagar: A cargó F1; B aprobó F1.
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'efectivo'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000)), null, v_a);
      raise exception 'TEST_FALLO: pagó la propia';
    exception when others then if sqlerrm <> 'NO_PUEDE_PAGAR_PROPIA' then raise; end if; v_ok := array_append(v_ok, 'NO_PUEDE_PAGAR_PROPIA'); end;
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'efectivo'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000)), null, v_b);
      raise exception 'TEST_FALLO: pagó lo que aprobó';
    exception when others then if sqlerrm <> 'NO_PUEDE_PAGAR_LO_QUE_APROBO' then raise; end if; v_ok := array_append(v_ok, 'NO_PUEDE_PAGAR_LO_QUE_APROBO'); end;
    -- Transferencia sin comprobante / a proveedor sin datos / monto > saldo.
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'transferencia'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000)), null, v_c);
      raise exception 'TEST_FALLO: transferencia sin comprobante';
    exception when others then if sqlerrm <> 'COMPROBANTE_REQUERIDO' then raise; end if; v_ok := array_append(v_ok, 'COMPROBANTE_REQUERIDO'); end;
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov2, 'fecha', public.hoy_ar(), 'forma_pago', 'transferencia'),
                                           jsonb_build_array(jsonb_build_object('tipo', 'a_cuenta', 'monto', 1000)),
                                           jsonb_build_object('tipo', 'comprobante_pago', 'storage_path', 'ordenes/pendientes/x.pdf', 'nombre_archivo', 'x.pdf', 'hash_sha256', 'h0', 'mime_type', 'application/pdf', 'size_bytes', 10), v_c);
      raise exception 'TEST_FALLO: sin datos de pago';
    exception when others then if sqlerrm <> 'PROVEEDOR_SIN_DATOS_PAGO' then raise; end if; v_ok := array_append(v_ok, 'PROVEEDOR_SIN_DATOS_PAGO'); end;
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'efectivo'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100000.01)), null, v_c);
      raise exception 'TEST_FALLO: supera saldo';
    exception when others then if sqlerrm <> 'MONTO_SUPERA_SALDO' then raise; end if; v_ok := array_append(v_ok, 'MONTO_SUPERA_SALDO'); end;
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'cheque'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000)), null, v_c);
      raise exception 'TEST_FALLO: cheque sin fecha de cobro';
    exception when others then if sqlerrm <> 'FECHA_COBRO_REQUERIDA' then raise; end if; v_ok := array_append(v_ok, 'FECHA_COBRO_REQUERIDA'); end;

    -- OP-0001 (contador C): F1 entera + F2 parcial 20.000 + NC 10.000 sobre F2 + a cuenta 5.000, transferencia con comprobante y PDF de la NC.
    v_r := public.pagos_registrar_orden(
      jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar(), 'forma_pago', 'transferencia', 'referencia', 'TRF 123', 'monto_pagado', 125000),
      jsonb_build_array(
        jsonb_build_object('factura_id', v_f1, 'monto', 100000),
        jsonb_build_object('factura_id', v_f2, 'monto', 20000),
        jsonb_build_object('tipo', 'nota_credito', 'factura_id', v_f2, 'monto', 10000, 'nc_numero', 'NC 0003-00000456', 'nc_fecha', public.hoy_ar() - 1),
        jsonb_build_object('tipo', 'a_cuenta', 'monto', 5000)),
      jsonb_build_array(
        jsonb_build_object('tipo', 'comprobante_pago', 'storage_path', 'ordenes/pendientes/a.pdf', 'nombre_archivo', 'a.pdf', 'hash_sha256', 'h1', 'mime_type', 'application/pdf', 'size_bytes', 100),
        jsonb_build_object('tipo', 'nota_credito', 'storage_path', 'ordenes/pendientes/nc.pdf', 'nombre_archivo', 'nc.pdf', 'hash_sha256', 'h2', 'mime_type', 'application/pdf', 'size_bytes', 100)),
      v_c);
    v_op := (v_r -> 'orden' ->> 'id')::bigint;
    if (v_r -> 'orden' ->> 'numero')::int <> 1 or (v_r -> 'orden' ->> 'numero_fmt') <> 'OP-0001'
       or (v_r -> 'orden' ->> 'monto_pagado')::numeric <> 125000 or (v_r -> 'orden' ->> 'monto_nc')::numeric <> 10000
       or (v_r -> 'orden' ->> 'cbu_destino') <> v_cbu or (v_r -> 'orden' ->> 'a_cuenta')::numeric <> 5000
       or not (v_r -> 'orden' ->> 'tiene_comprobante')::boolean or not (v_r -> 'orden' ->> 'tiene_nc_adjunto')::boolean then
      raise exception 'TEST_FALLO: OP-0001 %', v_r -> 'orden';
    end if;
    select estado, saldo, pagado, acreditado into v_estado, v_saldo, v_pagado, v_acreditado from public.v_pagos_facturas where id = v_f1;
    if v_estado <> 'pagada' or v_saldo <> 0 or v_pagado <> 100000 then raise exception 'TEST_FALLO: F1 tras OP % % %', v_estado, v_saldo, v_pagado; end if;
    select estado, saldo, pagado, acreditado into v_estado, v_saldo, v_pagado, v_acreditado from public.v_pagos_facturas where id = v_f2;
    if v_estado <> 'pagada_parcial' or v_saldo <> 20000 or v_pagado <> 20000 or v_acreditado <> 10000 then raise exception 'TEST_FALLO: F2 tras OP % % % %', v_estado, v_saldo, v_pagado, v_acreditado; end if;
    v_ok := array_append(v_ok, 'OP-0001:F1=pagada,F2=pagada_parcial(saldo 20000),monto_pagado=125000,monto_nc=10000,cbu_copiado');
    if (select saldo_aprobado from public.v_pagos_proveedor_saldo where proveedor_id = v_prov) <> 50000
       or (select a_cuenta_sin_aplicar from public.v_pagos_proveedor_saldo where proveedor_id = v_prov) <> 5000 then
      raise exception 'TEST_FALLO: saldo proveedor %', (select row_to_json(s) from public.v_pagos_proveedor_saldo s where proveedor_id = v_prov);
    end if;
    v_ok := array_append(v_ok, 'v_pagos_proveedor_saldo:saldo_aprobado=50000,a_cuenta=5000');

    -- Lo pagado es inmutable: editar total de F1 rebota; número sí se puede.
    begin
      perform public.pagos_editar_factura(v_f1, '{"total": 1}'::jsonb, null, null, v_a);
      raise exception 'TEST_FALLO: total de pagada editable';
    exception when others then if sqlerrm <> 'FACTURA_CON_PAGOS' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_CON_PAGOS(editar)'); end;
    perform public.pagos_editar_factura(v_f1, '{"numero": "0012-00007527", "numero_norm": "12-7527"}'::jsonb, null, null, v_a);
    if (select estado from public.pagos_facturas where id = v_f1) <> 'pagada' then raise exception 'TEST_FALLO: editar número cambió estado'; end if;
    -- Observar una parcial rebota; línea/OP inmutables.
    begin
      perform public.pagos_observar_factura(v_f2, 'mal cargada', v_c);
      raise exception 'TEST_FALLO: observó una parcial';
    exception when others then if sqlerrm <> 'FACTURA_CON_PAGOS' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_CON_PAGOS(observar)'); end;
    begin
      update public.pagos_orden_lineas set monto = 1 where orden_id = v_op;
      raise exception 'TEST_FALLO: línea editable';
    exception when others then if sqlerrm <> 'ORDEN_INMUTABLE' then raise; end if; v_ok := array_append(v_ok, 'ORDEN_INMUTABLE'); end;
    -- Resúmenes responden.
    if (select sum(monto_pagado) from public.pagos_ordenes_resumen('mes_pago')) <> 125000 then raise exception 'TEST_FALLO: ordenes_resumen'; end if;
    if (select sum(monto_nc) from public.pagos_ordenes_resumen('centro_costo')) <> 10000 then raise exception 'TEST_FALLO: ordenes_resumen cc'; end if;
    if (select count(*) from public.pagos_resumen('estado')) < 2 or (select sum(saldo) from public.pagos_resumen('centro_costo')) <> 50000 then
      raise exception 'TEST_FALLO: pagos_resumen %', (select json_agg(r) from public.pagos_resumen('centro_costo') r);
    end if;
    v_ok := array_append(v_ok, 'pagos_resumen+pagos_ordenes_resumen');
    -- Decisión 4: una obra interna con obras.cc cargado (CC PODA → 'IGLESIAS') es SU PROPIO centro, no el del cliente.
    select cod into v_obra_int_cc from public.obras
     where es_interna and not coalesce(archivada, false) and nullif(btrim(cc), '') is not null order by cod limit 1;
    if v_obra_int_cc is not null then
      v_r := public.pagos_crear_factura(
        jsonb_build_object('proveedor_id', v_prov2, 'tipo_comprobante', 'C', 'fecha', public.hoy_ar(), 'total', 12345, 'descripcion', 'Motosierra'),
        jsonb_build_array(jsonb_build_object('obra_cod', v_obra_int_cc, 'monto', 12345)), v_a);
      v_f6 := (v_r -> 'factura' ->> 'id')::bigint;
      select nom, nullif(btrim(cc), '') into v_nom_int, v_cc_int from public.obras where cod = v_obra_int_cc;
      if (v_r -> 'factura' ->> 'centro_costo') <> v_nom_int or not (v_r -> 'factura' ->> 'es_interna')::boolean
         or not ((v_r -> 'factura' -> 'centros_cc') ? v_nom_int) or ((v_r -> 'factura' -> 'centros_cc') ? v_cc_int) then
        raise exception 'TEST_FALLO: centro de obra interna % (cc %) → %', v_obra_int_cc, v_cc_int, v_r -> 'factura';
      end if;
      if not exists (select 1 from public.pagos_resumen('centro_costo') r where r.grupo = v_nom_int and r.es_interna and r.total = 12345)
         or exists (select 1 from public.pagos_resumen('centro_costo') r where r.grupo = v_cc_int and r.es_interna) then
        raise exception 'TEST_FALLO: pagos_resumen centro interna %', (select json_agg(r) from public.pagos_resumen('centro_costo') r);
      end if;
      -- El filtro p_centro_costo hereda la regla: F6 (única factura de prov2) entra por el nombre de la obra y no por su cc.
      if (select sum(r.total) from public.pagos_resumen('proveedor', v_prov2, null, v_nom_int) r) <> 12345
         or (select coalesce(sum(r.total), 0) from public.pagos_resumen('proveedor', v_prov2, null, v_cc_int) r) <> 0 then
        raise exception 'TEST_FALLO: filtro p_centro_costo interna';
      end if;
      v_ok := array_append(v_ok, format('centro_interna:%s→%s(no %s)', v_obra_int_cc, v_nom_int, v_cc_int));
    else
      v_ok := array_append(v_ok, 'centro_interna:sin_obra_interna_con_cc(no probado)');
    end if;

    -- Anular OP-0001: F1 y F2 vuelven a aprobada; adjuntos a deleted_at.
    v_r := public.pagos_anular_orden(v_op, 'transferencia rechazada por el banco', v_c);
    if (select estado from public.pagos_facturas where id = v_f1) <> 'aprobada' or (select estado from public.pagos_facturas where id = v_f2) <> 'aprobada'
       or (select aprobada_por from public.pagos_facturas where id = v_f1) <> v_b
       or exists (select 1 from public.pagos_ordenes_adjuntos where orden_id = v_op and deleted_at is null) then
      raise exception 'TEST_FALLO: anular OP';
    end if;
    begin
      perform public.pagos_anular_orden(v_op, 'otra vez', v_c);
      raise exception 'TEST_FALLO: anular dos veces';
    exception when others then if sqlerrm <> 'ORDEN_YA_ANULADA' then raise; end if; end;
    v_ok := array_append(v_ok, 'anular_OP:F1,F2=aprobada,adjuntos_borrados,ORDEN_YA_ANULADA');

    -- NC sola (sin plata) sobre una aprobada: OP-0002 con forma nota_credito y monto_pagado 0.
    v_r := public.pagos_registrar_orden(
      jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar()),
      jsonb_build_array(jsonb_build_object('tipo', 'nota_credito', 'factura_id', v_f2, 'monto', 50000, 'nc_numero', 'NC 1', 'nc_fecha', public.hoy_ar())),
      jsonb_build_object('tipo', 'nota_credito', 'storage_path', 'ordenes/pendientes/nc1.pdf', 'nombre_archivo', 'nc1.pdf', 'hash_sha256', 'h3', 'mime_type', 'application/pdf', 'size_bytes', 100),
      v_c);
    v_op2 := (v_r -> 'orden' ->> 'id')::bigint;
    if (v_r -> 'orden' ->> 'numero')::int <> 2 or (v_r -> 'orden' ->> 'forma_pago') <> 'nota_credito' or (v_r -> 'orden' ->> 'monto_pagado')::numeric <> 0
       or (select estado from public.pagos_facturas where id = v_f2) <> 'pagada' then
      raise exception 'TEST_FALLO: OP solo NC %', v_r -> 'orden';
    end if;
    v_ok := array_append(v_ok, 'OP-0002_solo_NC:forma=nota_credito,monto_pagado=0,F2=pagada');
    -- NC sobre una pendiente rebota (misma regla que la plata).
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar()),
        jsonb_build_array(jsonb_build_object('tipo', 'nota_credito', 'factura_id', v_f1, 'monto', 1, 'nc_numero', 'NC 2', 'nc_fecha', public.hoy_ar())), null, v_c);
      raise exception 'TEST_FALLO: NC sin PDF';
    exception when others then if sqlerrm <> 'COMPROBANTE_REQUERIDO' then raise; end if; end;
    perform public.pagos_observar_factura(v_f1, 'falta el remito', v_c);           -- F1 aprobada → observada
    begin
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov, 'fecha', public.hoy_ar()),
        jsonb_build_array(jsonb_build_object('tipo', 'nota_credito', 'factura_id', v_f1, 'monto', 1, 'nc_numero', 'NC 2', 'nc_fecha', public.hoy_ar())),
        jsonb_build_object('tipo', 'nota_credito', 'storage_path', 'ordenes/pendientes/nc2.pdf', 'nombre_archivo', 'nc2.pdf', 'hash_sha256', 'h4', 'mime_type', 'application/pdf', 'size_bytes', 100), v_c);
      raise exception 'TEST_FALLO: NC sobre observada';
    exception when others then if sqlerrm <> 'FACTURA_NO_APROBADA' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_NO_APROBADA(NC sobre observada)'); end;
    perform public.pagos_marcar_corregida(v_f1, 'remito adjuntado', v_a);
    if (select estado from public.pagos_facturas where id = v_f1) <> 'pendiente' then raise exception 'TEST_FALLO: corregida'; end if;
    perform public.pagos_aprobar_factura(v_f1, v_b);

    -- Desaprobación: editar total, cambiar CBU del proveedor, tocar el reparto.
    begin
      perform public.pagos_editar_factura(v_f1, '{"total": 120000}'::jsonb, null, null, v_a);   -- F1 tiene neto+iva: el total solo no cuadra
      raise exception 'TEST_FALLO: total sin desglose debía rebotar';
    exception when others then if sqlerrm <> 'DESGLOSE_NO_CUADRA' then raise; end if; v_ok := array_append(v_ok, 'DESGLOSE_NO_CUADRA'); end;
    begin
      perform public.pagos_editar_factura(v_f1, '{"total": 120000, "neto": 99173.55, "iva": 20826.45}'::jsonb, null, null, v_a);
      raise exception 'TEST_FALLO: total nuevo con dos obras debía pedir reimputar';
    exception when others then if sqlerrm <> 'IMPUTACION_NO_CUADRA' then raise; end if; end;
    if (select estado from public.pagos_facturas where id = v_f1) <> 'aprobada' then raise exception 'TEST_FALLO: el edit fallido dejó rastro'; end if;
    v_r := public.pagos_editar_factura(v_f1, '{"total": 120000, "neto": 99173.55, "iva": 20826.45}'::jsonb, jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 120000)), null, v_a);
    select estado, aprobada_por into v_estado, v_aprobada_por from public.pagos_facturas where id = v_f1;
    if v_estado <> 'pendiente' or v_aprobada_por is not null or not (v_r ->> 'aprobacion_retirada')::boolean then raise exception 'TEST_FALLO: desaprobar por total'; end if;
    perform public.pagos_aprobar_factura(v_f1, v_b);
    v_r := public.pagos_editar_factura(v_f1, '{"total": 121000, "neto": 100000, "iva": 21000}'::jsonb, null, null, v_a);   -- una sola obra: el reparto se ajusta solo
    if (select monto from public.pagos_imputaciones where factura_id = v_f1) <> 121000 or (select estado from public.pagos_facturas where id = v_f1) <> 'pendiente' then raise exception 'TEST_FALLO: ajuste de una obra'; end if;
    perform public.pagos_aprobar_factura(v_f1, v_b);
    update public.pagos_proveedores set cbu = '0720000788000001234569', updated_by = v_c where id = v_prov;
    select estado, aprobada_por into v_estado, v_aprobada_por from public.pagos_facturas where id = v_f1;
    if v_estado <> 'pendiente' or v_aprobada_por is not null
       or (select datos_pago_actualizados_por from public.pagos_proveedores where id = v_prov) <> v_c then raise exception 'TEST_FALLO: desaprobar por CBU'; end if;
    perform public.pagos_aprobar_factura(v_f1, v_b);
    perform public.pagos_editar_factura(v_f1, null, jsonb_build_array(jsonb_build_object('obra_cod', v_obra2, 'monto', 121000)), null, v_a);   -- F1 quedó en 121000 dos pasos atrás
    if (select estado from public.pagos_facturas where id = v_f1) <> 'pendiente' then raise exception 'TEST_FALLO: desaprobar por reparto'; end if;
    v_ok := array_append(v_ok, 'desaprueba:total,cbu,reparto');

    -- "Ya está pagada" al cargar: compras con tarjeta OK, con transferencia rebota; admin con transferencia OK.
    begin
      perform public.pagos_crear_factura(jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'ticket', 'fecha', public.hoy_ar(), 'total', 7000, 'descripcion', 'Tornillos'),
        jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 7000)), v_a, jsonb_build_object('fecha', public.hoy_ar(), 'forma_pago', 'transferencia'));
      raise exception 'TEST_FALLO: compras pagada con transferencia';
    exception when others then if sqlerrm <> 'PAGADA_AL_CARGAR_FORMA' then raise; end if; v_ok := array_append(v_ok, 'PAGADA_AL_CARGAR_FORMA'); end;
    v_r := public.pagos_crear_factura(jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'ticket', 'fecha', public.hoy_ar(), 'vence_el', public.hoy_ar() + 30, 'total', 7000, 'descripcion', 'Tornillos'),
      jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 7000)), v_a, jsonb_build_object('fecha', public.hoy_ar(), 'forma_pago', 'tarjeta', 'referencia', 'VISA'));
    v_f4 := (v_r -> 'factura' ->> 'id')::bigint; v_op4 := (v_r -> 'orden' ->> 'id')::bigint;
    if (v_r -> 'factura' ->> 'estado') <> 'pagada' or not (v_r -> 'factura' ->> 'sin_revisar')::boolean or (v_r -> 'factura' ->> 'vence_el') is not null
       or (v_r -> 'orden' ->> 'numero')::int <> 3 then raise exception 'TEST_FALLO: pagada al cargar %', v_r; end if;
    begin
      update public.pagos_facturas set estado = 'aprobada' where id = v_f4;
      raise exception 'TEST_FALLO: estado aprobada a mano';
    exception when others then if sqlerrm <> 'ESTADO_SOLO_RECALCULADOR' then raise; end if; end;
    -- Anular su OP (admin): queda pendiente, no aprobada.
    perform public.pagos_anular_orden(v_op4, 'no era con tarjeta', v_admin);
    if (select estado from public.pagos_facturas where id = v_f4) <> 'pendiente' then raise exception 'TEST_FALLO: pagada al cargar anulada debía quedar pendiente'; end if;
    begin
      update public.pagos_facturas set estado = 'aprobada' where id = v_f4;
      raise exception 'TEST_FALLO: estado aprobada a mano (pendiente)';
    exception when others then if sqlerrm <> 'APROBACION_SOLO_RPC' then raise; end if; v_ok := array_append(v_ok, 'APROBACION_SOLO_RPC(estado)'); end;
    v_ok := array_append(v_ok, 'pagada_al_cargar:pagada+sin_revisar,OP_anulada→pendiente');
    -- Otra pagada al cargar: sellar (Diego) y después rechazar con pagos_anular_pagada_al_cargar.
    v_r := public.pagos_crear_factura(jsonb_build_object('proveedor_id', v_prov, 'tipo_comprobante', 'recibo', 'fecha', public.hoy_ar(), 'total', 3000, 'descripcion', 'Mostrador'),
      jsonb_build_array(jsonb_build_object('obra_cod', v_obra1, 'monto', 3000)), v_a, jsonb_build_object('fecha', public.hoy_ar(), 'forma_pago', 'efectivo'));
    v_f5 := (v_r -> 'factura' ->> 'id')::bigint;
    perform public.pagos_aprobar_factura(v_f5, v_b);   -- sello
    if (select estado from public.pagos_facturas where id = v_f5) <> 'pagada' or (select aprobada_por from public.pagos_facturas where id = v_f5) <> v_b then raise exception 'TEST_FALLO: sello'; end if;
    begin
      perform public.pagos_aprobar_factura(v_f5, v_b);
      raise exception 'TEST_FALLO: sello doble';
    exception when others then if sqlerrm <> 'FACTURA_NO_APROBABLE' then raise; end if; v_ok := array_append(v_ok, 'FACTURA_NO_APROBABLE'); end;
    v_r := public.pagos_anular_pagada_al_cargar(v_f5, 'ticket repetido', v_b);
    if (v_r -> 'factura' ->> 'estado') <> 'anulada' or (v_r -> 'orden' ->> 'estado') <> 'anulada' then raise exception 'TEST_FALLO: anular pagada al cargar %', v_r; end if;
    v_ok := array_append(v_ok, 'sello+pagos_anular_pagada_al_cargar');
    -- Anular una factura con pagos rebota; sin pagos anula.
    begin
      perform public.pagos_anular_factura(v_f2, 'x', v_admin);
      raise exception 'TEST_FALLO: anular con pagos';
    exception when others then if sqlerrm not in ('FACTURA_CON_PAGOS', 'MOTIVO_REQUERIDO') then raise; end if; end;
    begin
      perform public.pagos_anular_factura(v_f2, 'cargada dos veces', v_admin);
      raise exception 'TEST_FALLO: anular con pagos 2';
    exception when others then if sqlerrm <> 'FACTURA_CON_PAGOS' then raise; end if; end;
    perform public.pagos_anular_factura(v_f3, 'cargada dos veces', v_admin);
    if (select estado from public.pagos_facturas where id = v_f3) <> 'anulada' then raise exception 'TEST_FALLO: anular'; end if;
    -- Anulada: saldo 0 en la vista, y no se cuenta en el resumen salvo pidiéndola por estado.
    if (select saldo from public.v_pagos_facturas where id = v_f3) <> 0 then raise exception 'TEST_FALLO: anulada con saldo'; end if;
    if exists (select 1 from public.pagos_resumen('proveedor', v_prov, null, null, array['pendiente','observada','aprobada','pagada_parcial','pagada']) r where r.facturas <> (select count(*) from public.pagos_facturas where proveedor_id = v_prov and estado <> 'anulada'))
       or (select sum(r.saldo) from public.pagos_resumen('proveedor', v_prov, null, null, array['anulada']) r) <> 0 then
      raise exception 'TEST_FALLO: resumen con anuladas';
    end if;
    v_ok := array_append(v_ok, 'anular_factura(saldo 0, fuera del resumen)');
    -- Decisión 4 en el eje de pago: la OP de F6 (obra interna con cc) cae en su propio centro. Va al final para no correr la numeración OP-NNNN que asumen los pasos anteriores.
    if v_f6 is not null then
      perform public.pagos_aprobar_factura(v_f6, v_b);
      perform public.pagos_registrar_orden(jsonb_build_object('proveedor_id', v_prov2, 'fecha', public.hoy_ar(), 'forma_pago', 'efectivo'),
                                           jsonb_build_array(jsonb_build_object('factura_id', v_f6, 'monto', 12345)), null, v_c);
      if not exists (select 1 from public.pagos_ordenes_resumen('centro_costo') r where r.grupo = v_nom_int and r.es_interna and r.monto_pagado = 12345)
         or exists (select 1 from public.pagos_ordenes_resumen('centro_costo') r where r.grupo = v_cc_int and r.es_interna) then
        raise exception 'TEST_FALLO: pagos_ordenes_resumen centro interna %', (select json_agg(r) from public.pagos_ordenes_resumen('centro_costo') r);
      end if;
      v_ok := array_append(v_ok, 'ordenes_resumen_centro_interna');
    end if;

    select json_build_object('pasos', v_ok, 'facturas', (select count(*) from public.pagos_facturas), 'ordenes', (select count(*) from public.pagos_ordenes),
                             'audit', (select count(*) from public.audit_log where modulo = 'pagos'))::text into v_info;
    raise exception 'ROLLBACK_OK %', v_info;
  exception when others then
    if sqlerrm like 'ROLLBACK_OK%' then
      raise notice '%', sqlerrm;
    else
      raise;
    end if;
  end;
  -- Las secuencias no se deshacen con la subtransacción: que la primera factura real sea la 1.
  if (select count(*) from public.pagos_facturas) = 0 then
    perform setval('public.pagos_proveedores_id_seq', 1, false);
    perform setval('public.pagos_facturas_id_seq', 1, false);
    perform setval('public.pagos_imputaciones_id_seq', 1, false);
    perform setval('public.pagos_ordenes_id_seq', 1, false);
    perform setval('public.pagos_orden_lineas_id_seq', 1, false);
    perform setval('public.pagos_facturas_adjuntos_id_seq', 1, false);
    perform setval('public.pagos_ordenes_adjuntos_id_seq', 1, false);
  end if;
end $t$;
