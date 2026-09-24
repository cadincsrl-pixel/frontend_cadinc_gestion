-- =====================================================================
-- 20260924m — Ventas / Cobranzas: saldos, deudores, estado de cuenta y
-- vistas (2026-09-24)
--
-- Requiere 20260924k/l. Una sola fuente de verdad del saldo:
-- `ventas_saldos_al(p_al, p_cliente_id, p_ambiente)`. Todo lo demás (vistas,
-- deudores y las RPC de 20260924n que validan bajo FOR UPDATE) sale de ahí.
--
-- ── Regla de las NC propias (sin doble descuento) ─────────────────────
-- Una NC del ERP (3/8/203) SIEMPRE tiene su factura asociada
-- (ventas_factura_asociados; NC_SIN_FACTURA la exige al emitir). Fiscalmente
-- ya la corrige, así que:
--   1. La NC baja AUTOMÁTICAMENTE el saldo de su factura. No hace falta
--      imputarla.
--   2. Solo la parte que su factura NO puede absorber queda como crédito
--      LIBRE de la NC. Pasa cuando la factura ya estaba cobrada (o
--      compensada) al emitir la NC. Ese libre, y solo ese, se puede compensar
--      contra OTRA factura del mismo cliente (ventas_imputar con
--      nc_factura_id).
--   3. Cada peso de la NC está en uno solo de tres lugares: absorbido por su
--      factura, compensado en otra, o libre. Por eso la absorción se calcula
--      sobre lo NO compensado:
--        disponible_nc   = total_nc − compensado_desde_la_nc
--        capacidad_fact  = max(0, total_fact − imputaciones_recibidas)
--        absorbida       = se reparte la capacidad entre sus NC en orden de id
--        saldo_fact      = total_fact − absorbida − imputaciones_recibidas  (≥ 0)
--        libre_nc        = disponible_nc − absorbida_nc                    (≥ 0)
--      Si se anula un cobro de la factura, la NC vuelve a absorber (su libre
--      baja); si se anula una compensación, el crédito vuelve a la NC.
--      Invariante (probado en el rollback de 20260924n): para cada cliente,
--        Σ saldo débitos − Σ créditos libres − Σ a cuenta
--          = Σ débitos − Σ NC − Σ cobros   (lo mismo que da el estado de cuenta).
--
-- NC EXTERNAS (3/8/203 de ARCA/Finnegans): no tienen asociación en la base;
-- su `saldo_inicial` es crédito libre y se aplica solo por compensación.
--
-- Ambiente: los externos son siempre 'prod'. El backend filtra
-- `ambiente = 'prod'` salvo `?ambiente=homo`.
--
-- `p_al` (fecha de corte): cuenta comprobantes, cobros e imputaciones con
-- fecha ≤ p_al. Las anulaciones son retroactivas (un cobro anulado nunca
-- existió). Sin p_al = hoy.
--
-- Rendimiento: la función calcula todos los saldos del filtro de una vez
-- (lleva `set search_path`, así que Postgres no la inlinea). Con el volumen
-- de CADINC (cientos de comprobantes) es del orden de milisegundos; si crece,
-- pasar el filtro de cliente o materializar.
-- =====================================================================

-- ── Arreglo del guard de 20260924k ────────────────────────────────────
-- La versión de 20260924k leía `new.adjunto_hash` en una condición que
-- PL/pgSQL evalúa entera: en ventas_cobros / medios / imputaciones esa
-- columna no existe y el INSERT (ya dentro de una RPC) rompía con 42703. Se
-- lee por to_jsonb, que existe en las cuatro tablas.
create or replace function public.fn_ventas_cobros_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_rpc    boolean := coalesce(current_setting('cadinc.ventas_rpc', true), '') = 'on';
  v_libres text[] := case tg_table_name
    when 'ventas_cobros' then array['obs', 'updated_at', 'updated_by']
    when 'ventas_cobro_retenciones' then array['adjunto_path', 'adjunto_nombre', 'adjunto_hash', 'adjunto_mime',
                                               'adjunto_size', 'obs', 'updated_at', 'updated_by']
    else array[]::text[] end;
  v_hash   text;
  v_otra   bigint;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'COBRO_NO_BORRABLE' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'id', old.id)::text;
  end if;
  if tg_op = 'INSERT' and not v_rpc then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'operacion', 'insert')::text;
  end if;
  if tg_op = 'UPDATE' and not v_rpc
     and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'id', old.id)::text;
  end if;
  -- Un mismo certificado escaneado no se adjunta a dos retenciones de cobros vigentes.
  if tg_table_name = 'ventas_cobro_retenciones' then
    v_hash := to_jsonb(new) ->> 'adjunto_hash';
    if v_hash is not null and (tg_op = 'INSERT' or v_hash is distinct from (to_jsonb(old) ->> 'adjunto_hash')) then
      select r.id into v_otra
        from public.ventas_cobro_retenciones r join public.ventas_cobros c on c.id = r.cobro_id
       where r.adjunto_hash = v_hash and r.id <> new.id and c.estado = 'vigente'
       limit 1;
      if v_otra is not null then
        raise exception 'RETENCION_ADJUNTO_DUPLICADO' using errcode = 'P0001',
          detail = json_build_object('retencion_id', new.id, 'otra_retencion_id', v_otra)::text;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ── Nombres y abreviaturas de comprobante ─────────────────────────────

create or replace function public._ventas_abrev_cbte(p_tipo smallint) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case p_tipo
           when 1 then 'FA' when 2 then 'NDA' when 3 then 'NCA'
           when 6 then 'FB' when 7 then 'NDB' when 8 then 'NCB'
           when 60 then 'CVLP A' when 61 then 'CVLP B'
           when 201 then 'FCE A' when 202 then 'NDE A' when 203 then 'NCE A'
         end
$$;

create or replace function public._ventas_nombre_cbte(p_tipo smallint) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case p_tipo
           when 1 then 'Factura A' when 2 then 'Nota de Débito A' when 3 then 'Nota de Crédito A'
           when 6 then 'Factura B' when 7 then 'Nota de Débito B' when 8 then 'Nota de Crédito B'
           when 60 then 'Cuenta de Venta y Líquido Producto A' when 61 then 'Cuenta de Venta y Líquido Producto B'
           when 201 then 'Factura de Crédito Electrónica MiPyMEs A'
           when 202 then 'Nota de Débito Electrónica MiPyMEs A'
           when 203 then 'Nota de Crédito Electrónica MiPyMEs A'
         end
$$;

create or replace function public._ventas_numero_fmt(p_pto_vta int, p_numero bigint) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select lpad(p_pto_vta::text, 5, '0') || '-' || lpad(p_numero::text, 8, '0')
$$;

create or replace function public._ventas_recibo_fmt(p_numero bigint) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select 'RC 0001-' || lpad(p_numero::text, 8, '0')
$$;

-- ── LA fuente de verdad del saldo ─────────────────────────────────────
-- Una fila por comprobante:
--   naturaleza 'debito'  → facturas del ERP autorizadas (no NC) y FC/ND externas.
--   naturaleza 'credito' → NC del ERP autorizadas, NC externas y cobros vigentes.
-- Columnas:
--   total          importe del comprobante.
--   saldo_inicial  = total en el ERP y en los cobros; el de la fecha de corte en externos.
--   nc_aplicadas   (débitos) NC que lo bajan: absorción de sus NC asociadas + compensaciones.
--                  (NC propias) lo que absorbió su factura asociada.
--   cobrado        (débitos) imputaciones desde cobros.
--   compensado     (débitos) la parte de nc_aplicadas que vino de compensaciones.
--                  (créditos) lo que se usó de este crédito en imputaciones/compensaciones.
--   aplicado       saldo_inicial − saldo (para todos).
--   saldo          lo que se debe (débito) o el crédito libre (crédito). Siempre ≥ 0.
--   estado         débito: 'pagada' | 'parcial' | 'pendiente'; crédito: 'usado' | 'parcial' | 'disponible'.
--   dias_vencido   días desde vence_el a la fecha de corte, solo débitos con saldo (si no, 0).
create or replace function public.ventas_saldos_al(p_al date default null, p_cliente_id bigint default null,
                                                   p_ambiente text default null)
returns table (
  origen          text,        -- 'erp' | 'externo' | 'cobro'
  naturaleza      text,        -- 'debito' | 'credito'
  factura_id      bigint,
  externo_id      bigint,
  cobro_id        bigint,
  ambiente        text,
  cliente_id      bigint,
  cbte_tipo       smallint,    -- código ARCA (null en cobros)
  tipo            text,        -- 'FC' | 'ND' | 'NC' | 'RC'
  letra           text,
  pto_vta         int,
  numero          bigint,
  tipo_abrev      text,        -- 'FA', 'FCE A', 'NCA', 'CVLP A', 'RC', …
  numero_fmt      text,        -- '00004-00000001' | 'RC 0001-00000001'
  comprobante     text,        -- 'FA 00004-00000001' | 'RC 0001-00000001'
  fecha           date,
  vence_el        date,
  total           numeric(14,2),
  saldo_inicial   numeric(14,2),
  nc_aplicadas    numeric(14,2),
  cobrado         numeric(14,2),
  compensado      numeric(14,2),
  aplicado        numeric(14,2),
  saldo           numeric(14,2),
  saldo_a_revisar boolean,
  estado          text,
  dias_vencido    int
)
language sql stable set search_path = public, pg_temp as $$
with
prm as (select coalesce(p_al, public.hoy_ar()) as corte),
fac as (
  select f.id, f.ambiente, f.cliente_id, f.cbte_tipo, f.pto_vta, f.numero, f.fecha_cbte, f.vence_el, f.imp_total
    from public.ventas_facturas f
   where f.estado = 'autorizada'
     and (p_al is null or f.fecha_cbte <= p_al)
     and (p_cliente_id is null or f.cliente_id = p_cliente_id)
     and (p_ambiente is null or f.ambiente = p_ambiente)),
ext as (
  select e.*
    from public.ventas_comprobantes_externos e
   where (p_al is null or e.fecha <= p_al)
     and (p_cliente_id is null or e.cliente_id = p_cliente_id)
     and (p_ambiente is null or p_ambiente = 'prod')),
cob as (
  select c.*
    from public.ventas_cobros c
   where c.estado = 'vigente'
     and (p_al is null or c.fecha <= p_al)
     and (p_cliente_id is null or c.cliente_id = p_cliente_id)
     and (p_ambiente is null or c.ambiente = p_ambiente)),
imp as (
  select i.*
    from public.ventas_imputaciones i
   where not i.anulada and (p_al is null or i.fecha <= p_al)),
imp_dest as (
  select i.factura_id, i.externo_id,
         coalesce(sum(i.importe) filter (where i.cobro_id is not null), 0) as cobrado,
         coalesce(sum(i.importe) filter (where i.cobro_id is null), 0)     as compensado
    from imp i group by i.factura_id, i.externo_id),
imp_orig as (
  select i.cobro_id, i.nc_factura_id, i.nc_externo_id, sum(i.importe) as usado
    from imp i group by i.cobro_id, i.nc_factura_id, i.nc_externo_id),
deb_fac as (
  select f.*, coalesce(d.cobrado, 0) as cobrado, coalesce(d.compensado, 0) as compensado,
         greatest(0, f.imp_total - coalesce(d.cobrado, 0) - coalesce(d.compensado, 0)) as cap
    from fac f left join imp_dest d on d.factura_id = f.id
   where f.cbte_tipo not in (3, 8, 203)),
nc as (
  select n.*, a.asociada_id, coalesce(o.usado, 0) as usado, n.imp_total - coalesce(o.usado, 0) as disp
    from fac n
    left join lateral (select s.asociada_id from public.ventas_factura_asociados s
                        where s.factura_id = n.id order by s.id limit 1) a on true
    left join imp_orig o on o.nc_factura_id = n.id
   where n.cbte_tipo in (3, 8, 203)),
nc_abs as (
  select nc.*,
         case when d.id is null then 0::numeric
              else least(nc.disp, greatest(0, d.cap - (sum(nc.disp) over w - nc.disp))) end as absorbida
    from nc left join deb_fac d on d.id = nc.asociada_id
  window w as (partition by nc.asociada_id order by nc.id)),
abs_fac as (select asociada_id, sum(absorbida) as absorbida from nc_abs group by asociada_id),
filas as (
  -- Débitos del ERP
  select 'erp'::text as origen, 'debito'::text as naturaleza, d.id as factura_id, null::bigint as externo_id,
         null::bigint as cobro_id, d.ambiente, d.cliente_id, d.cbte_tipo,
         case when d.cbte_tipo in (2, 7, 202) then 'ND' else 'FC' end as tipo,
         case when d.cbte_tipo in (6, 7, 8, 61) then 'B' else 'A' end as letra,
         d.pto_vta, d.numero, d.fecha_cbte as fecha, d.vence_el, d.imp_total as total, d.imp_total as saldo_inicial,
         coalesce(a.absorbida, 0) + d.compensado as nc_aplicadas, d.cobrado, d.compensado,
         d.imp_total - coalesce(a.absorbida, 0) - d.compensado - d.cobrado as saldo,
         false as saldo_a_revisar
    from deb_fac d left join abs_fac a on a.asociada_id = d.id
  union all
  -- NC del ERP (crédito libre)
  select 'erp', 'credito', n.id, null, null, n.ambiente, n.cliente_id, n.cbte_tipo, 'NC',
         case when n.cbte_tipo = 8 then 'B' else 'A' end,
         n.pto_vta, n.numero, n.fecha_cbte, n.fecha_cbte, n.imp_total, n.imp_total,
         n.absorbida, 0, n.usado,
         n.disp - n.absorbida, false
    from nc_abs n
  union all
  -- Externos: débitos y NC
  select 'externo', case when e.tipo = 'NC' then 'credito' else 'debito' end, null, e.id, null, 'prod', e.cliente_id,
         e.cbte_tipo, e.tipo, e.letra, e.pto_vta, e.numero, e.fecha, e.vence_el, e.total, e.saldo_inicial,
         case when e.tipo = 'NC' then 0 else coalesce(d.compensado, 0) end,
         case when e.tipo = 'NC' then 0 else coalesce(d.cobrado, 0) end,
         case when e.tipo = 'NC' then coalesce(o.usado, 0) else coalesce(d.compensado, 0) end,
         case when e.tipo = 'NC' then e.saldo_inicial - coalesce(o.usado, 0)
              else e.saldo_inicial - coalesce(d.compensado, 0) - coalesce(d.cobrado, 0) end,
         e.saldo_a_revisar
    from ext e
    left join imp_dest d on d.externo_id = e.id
    left join imp_orig o on o.nc_externo_id = e.id
  union all
  -- Cobros: lo que queda a cuenta
  select 'cobro', 'credito', null, null, c.id, c.ambiente, c.cliente_id, null::smallint, 'RC', null,
         1, c.numero, c.fecha, c.fecha, c.total, c.total, 0, 0, coalesce(o.usado, 0),
         c.total - coalesce(o.usado, 0), false
    from cob c left join imp_orig o on o.cobro_id = c.id
)
select f.origen, f.naturaleza, f.factura_id, f.externo_id, f.cobro_id, f.ambiente, f.cliente_id, f.cbte_tipo,
       f.tipo, f.letra, f.pto_vta, f.numero,
       case when f.origen = 'cobro' then 'RC' else public._ventas_abrev_cbte(f.cbte_tipo) end,
       case when f.origen = 'cobro' then public._ventas_recibo_fmt(f.numero) else public._ventas_numero_fmt(f.pto_vta, f.numero) end,
       case when f.origen = 'cobro' then public._ventas_recibo_fmt(f.numero)
            else public._ventas_abrev_cbte(f.cbte_tipo) || ' ' || public._ventas_numero_fmt(f.pto_vta, f.numero) end,
       f.fecha, f.vence_el,
       f.total::numeric(14,2), f.saldo_inicial::numeric(14,2), f.nc_aplicadas::numeric(14,2),
       f.cobrado::numeric(14,2), f.compensado::numeric(14,2),
       (f.saldo_inicial - f.saldo)::numeric(14,2), f.saldo::numeric(14,2), f.saldo_a_revisar,
       case when f.naturaleza = 'debito' then
              case when f.saldo <= 0 then 'pagada' when f.saldo < f.saldo_inicial then 'parcial' else 'pendiente' end
            else
              case when f.saldo <= 0 then 'usado' when f.saldo < f.saldo_inicial then 'parcial' else 'disponible' end
       end,
       case when f.naturaleza = 'debito' and f.saldo > 0 then greatest(0, (select corte from prm) - f.vence_el) else 0 end
  from filas f
$$;

comment on function public.ventas_saldos_al(date, bigint, text) is
  'Saldo de cada comprobante (débitos: facturas ERP y FC/ND externas; créditos: NC ERP, NC externas, cobros a cuenta) a una fecha de corte. ÚNICA fuente de verdad del saldo. La NC del ERP baja sola a su factura; solo su parte no absorbida es crédito libre. 20260924m.';

-- ── Vistas de saldos ──────────────────────────────────────────────────

create view public.v_ventas_saldos with (security_invoker = true) as
select s.*, c.razon_social as cliente_razon_social, c.doc_nro as cliente_doc_nro,
       (s.dias_vencido > 0) as vencida
  from public.ventas_saldos_al() s
  join public.ventas_clientes c on c.id = s.cliente_id
 where s.naturaleza = 'debito';
comment on view public.v_ventas_saldos is
  'Un débito por fila (facturas ERP autorizadas no NC + FC/ND externas) con saldo, estado y días vencido a hoy. Filtrar ambiente = prod. 20260924m.';

create view public.v_ventas_creditos with (security_invoker = true) as
select s.*, c.razon_social as cliente_razon_social, c.doc_nro as cliente_doc_nro
  from public.ventas_saldos_al() s
  join public.ventas_clientes c on c.id = s.cliente_id
 where s.naturaleza = 'credito';
comment on view public.v_ventas_creditos is
  'Créditos del cliente: NC del ERP (saldo = parte no absorbida por su factura), NC externas y cobros con a cuenta. Para el popup de compensación. 20260924m.';

-- ── Deudores ──────────────────────────────────────────────────────────

create or replace function public.ventas_deudores_al(p_al date default null, p_ambiente text default null)
returns table (
  ambiente               text,
  cliente_id             bigint,
  cliente_razon_social   text,
  cliente_doc_nro        text,
  saldo                  numeric(14,2),   -- Σ saldo de los débitos
  a_cuenta               numeric(14,2),   -- Σ a cuenta de cobros vigentes
  nc_disponible          numeric(14,2),   -- Σ crédito libre de NC (ERP + externas)
  saldo_neto             numeric(14,2),   -- saldo − a_cuenta − nc_disponible
  al_dia                 numeric(14,2),
  d1_30                  numeric(14,2),
  d31_60                 numeric(14,2),
  d61_90                 numeric(14,2),
  d90_mas                numeric(14,2),
  vencido                numeric(14,2),
  saldo_a_revisar        numeric(14,2),   -- parte del saldo que viene de externos «a revisar»
  comprobantes           int,             -- débitos con saldo > 0
  ultima_cobranza        date,
  ultima_cobranza_total  numeric(14,2)
)
language sql stable set search_path = public, pg_temp as $$
with s as (select * from public.ventas_saldos_al(p_al, null, p_ambiente)),
agg as (
  select s.ambiente, s.cliente_id,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito'), 0) as saldo,
         coalesce(sum(s.saldo) filter (where s.origen = 'cobro'), 0) as a_cuenta,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'credito' and s.origen <> 'cobro'), 0) as nc_disponible,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias_vencido = 0), 0) as al_dia,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias_vencido between 1 and 30), 0) as d1_30,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias_vencido between 31 and 60), 0) as d31_60,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias_vencido between 61 and 90), 0) as d61_90,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.dias_vencido > 90), 0) as d90_mas,
         coalesce(sum(s.saldo) filter (where s.naturaleza = 'debito' and s.saldo_a_revisar), 0) as saldo_a_revisar,
         count(*) filter (where s.naturaleza = 'debito' and s.saldo > 0)::int as comprobantes
    from s group by s.ambiente, s.cliente_id)
select a.ambiente, a.cliente_id, c.razon_social, c.doc_nro,
       a.saldo, a.a_cuenta, a.nc_disponible, (a.saldo - a.a_cuenta - a.nc_disponible)::numeric(14,2),
       a.al_dia, a.d1_30, a.d31_60, a.d61_90, a.d90_mas,
       (a.d1_30 + a.d31_60 + a.d61_90 + a.d90_mas)::numeric(14,2),
       a.saldo_a_revisar, a.comprobantes,
       u.fecha, u.total
  from agg a
  join public.ventas_clientes c on c.id = a.cliente_id
  left join lateral (
    select k.fecha, k.total from public.ventas_cobros k
     where k.cliente_id = a.cliente_id and k.ambiente = a.ambiente and k.estado = 'vigente'
       and (p_al is null or k.fecha <= p_al)
     order by k.fecha desc, k.id desc limit 1) u on true
 where a.saldo > 0 or a.a_cuenta > 0 or a.nc_disponible > 0
$$;
comment on function public.ventas_deudores_al(date, text) is
  'Estado de deudores por cliente y ambiente a una fecha de corte (antigüedad por vence_el). 20260924m.';

create view public.v_ventas_deudores with (security_invoker = true) as
select * from public.ventas_deudores_al();
comment on view public.v_ventas_deudores is 'Deudores a hoy (ventas_deudores_al sin fecha). Filtrar ambiente = prod. 20260924m.';

-- ── Estado de cuenta ──────────────────────────────────────────────────
-- Movimientos cronológicos del cliente con saldo corrido. debe − haber:
--   factura/ND del ERP → debe total; NC del ERP → haber total;
--   externo débito → debe saldo_inicial (lo pendiente al corte); externo NC → haber saldo_inicial
--     (los externos con saldo_inicial 0 no aparecen: ya estaban saldados);
--   cobro → una línea haber por los medios y una por cada retención.
-- Con p_desde, la primera fila es 'saldo_anterior'. `orden` es el orden a mostrar.
-- El saldo final coincide con saldo_neto de ventas_deudores_al.
create or replace function public.ventas_estado_cuenta(p_cliente_id bigint, p_desde date default null,
                                                       p_hasta date default null, p_ambiente text default 'prod')
returns table (
  orden        bigint,
  fecha        date,
  movimiento   text,      -- 'saldo_anterior' | 'factura' | 'nota_debito' | 'nota_credito' | 'externo' | 'externo_nc' | 'cobro' | 'retencion'
  comprobante  text,
  detalle      text,
  vence_el     date,
  debe         numeric(14,2),
  haber        numeric(14,2),
  saldo        numeric(14,2),
  factura_id   bigint,
  externo_id   bigint,
  cobro_id     bigint,
  retencion_id bigint
)
language sql stable set search_path = public, pg_temp as $$
with amb as (select coalesce(p_ambiente, 'prod') as a),
mov as (
  select f.fecha_cbte as fecha,
         case when f.cbte_tipo in (3, 8, 203) then 'nota_credito'
              when f.cbte_tipo in (2, 7, 202) then 'nota_debito' else 'factura' end as movimiento,
         public._ventas_abrev_cbte(f.cbte_tipo) || ' ' || public._ventas_numero_fmt(f.pto_vta, f.numero) as comprobante,
         nullif(btrim(coalesce(f.centro_costo, '') || case when f.observaciones <> '' then ' — ' || f.observaciones else '' end), '') as detalle,
         case when f.cbte_tipo in (3, 8, 203) then null else f.vence_el end as vence_el,
         case when f.cbte_tipo in (3, 8, 203) then 0 else f.imp_total end as debe,
         case when f.cbte_tipo in (3, 8, 203) then f.imp_total else 0 end as haber,
         f.id as factura_id, null::bigint as externo_id, null::bigint as cobro_id, null::bigint as retencion_id,
         1 as prio, f.id as sub
    from public.ventas_facturas f, amb
   where f.cliente_id = p_cliente_id and f.estado = 'autorizada' and f.ambiente = amb.a
  union all
  select e.fecha, case when e.tipo = 'NC' then 'externo_nc' else 'externo' end,
         public._ventas_abrev_cbte(e.cbte_tipo) || ' ' || public._ventas_numero_fmt(e.pto_vta, e.numero),
         'Saldo inicial (' || e.origen || ')' || case when e.saldo_inicial < e.total
              then ' — total ' || to_char(e.total, 'FM999G999G999G990D00') else '' end,
         case when e.tipo = 'NC' then null else e.vence_el end,
         case when e.tipo = 'NC' then 0 else e.saldo_inicial end,
         case when e.tipo = 'NC' then e.saldo_inicial else 0 end,
         null, e.id, null, null, 0, e.id
    from public.ventas_comprobantes_externos e, amb
   where e.cliente_id = p_cliente_id and amb.a = 'prod' and e.saldo_inicial > 0
  union all
  select c.fecha, 'cobro', public._ventas_recibo_fmt(c.numero),
         (select string_agg(m.forma || coalesce(' ' || nullif(m.cheque_numero, ''), ''), ', ' order by m.orden)
            from public.ventas_cobro_medios m where m.cobro_id = c.id),
         null, 0, c.total_medios, null, null, c.id, null, 2, c.id
    from public.ventas_cobros c, amb
   where c.cliente_id = p_cliente_id and c.estado = 'vigente' and c.ambiente = amb.a and c.total_medios > 0
  union all
  select c.fecha, 'retencion', public._ventas_recibo_fmt(c.numero),
         'Retención ' || upper(r.tipo) || coalesce(' ' || nullif(r.jurisdiccion, ''), '')
           || coalesce(' cert. ' || nullif(r.certificado_numero, ''), ''),
         null, 0, r.importe, null, null, c.id, r.id, 3, r.id
    from public.ventas_cobros c join public.ventas_cobro_retenciones r on r.cobro_id = c.id, amb
   where c.cliente_id = p_cliente_id and c.estado = 'vigente' and c.ambiente = amb.a
),
ant as (
  select coalesce(sum(debe - haber), 0) as s from mov where p_desde is not null and mov.fecha < p_desde),
per as (
  select * from mov
   where (p_desde is null or mov.fecha >= p_desde) and (p_hasta is null or mov.fecha <= p_hasta)),
todo as (
  select p_desde as fecha, 'saldo_anterior'::text as movimiento, null::text as comprobante, 'Saldo anterior'::text as detalle,
         null::date as vence_el, greatest(ant.s, 0) as debe, greatest(-ant.s, 0) as haber,
         null::bigint as factura_id, null::bigint as externo_id, null::bigint as cobro_id, null::bigint as retencion_id,
         -1 as prio, 0::bigint as sub
    from ant where p_desde is not null
  union all
  select fecha, movimiento, comprobante, detalle, vence_el, debe, haber, factura_id, externo_id, cobro_id, retencion_id, prio, sub
    from per)
select row_number() over o,
       t.fecha, t.movimiento, t.comprobante, t.detalle, t.vence_el,
       t.debe::numeric(14,2), t.haber::numeric(14,2),
       (sum(t.debe - t.haber) over o)::numeric(14,2),
       t.factura_id, t.externo_id, t.cobro_id, t.retencion_id
  from todo t
window o as (order by t.fecha nulls first, t.prio, t.sub rows between unbounded preceding and current row)
$$;
comment on function public.ventas_estado_cuenta(bigint, date, date, text) is
  'Estado de cuenta del cliente: movimientos con saldo corrido (debe − haber), con saldo anterior si hay p_desde. 20260924m.';

-- ── Cobros ────────────────────────────────────────────────────────────

create view public.v_ventas_cobros with (security_invoker = true) as
select c.id, c.ambiente, c.numero, public._ventas_recibo_fmt(c.numero) as numero_fmt, c.fecha,
       c.cliente_id, cl.razon_social as cliente_razon_social, cl.doc_nro as cliente_doc_nro,
       c.total_medios, c.total_retenciones, c.total, c.aplicado, c.a_cuenta, c.estado,
       c.anulado_motivo, c.anulado_por, pa.nombre as anulado_por_nombre, c.anulado_el,
       c.obs, c.created_at, c.updated_at, c.created_by, pc.nombre as created_by_nombre, c.updated_by,
       (c.ambiente = 'homo') as es_homologacion,
       coalesce(im.n, 0)       as cantidad_imputaciones,
       coalesce(me.n, 0)       as cantidad_medios,
       coalesce(me.formas, array[]::text[]) as medios_formas,
       coalesce(rt.n, 0)       as cantidad_retenciones,
       coalesce(rt.resumen, '[]'::jsonb) as retenciones_resumen,   -- [{tipo, importe}] sumado por tipo
       public.norm_txt(public._ventas_recibo_fmt(c.numero) || ' ' || c.numero || ' ' || cl.razon_social || ' '
                       || cl.doc_nro || ' ' || c.obs || ' ' || coalesce(me.busq, '') || ' ' || coalesce(rt.busq, '')) as busq
  from public.ventas_cobros c
  join public.ventas_clientes cl on cl.id = c.cliente_id
  left join public.profiles pc on pc.id = c.created_by
  left join public.profiles pa on pa.id = c.anulado_por
  left join lateral (select count(*)::int as n from public.ventas_imputaciones i
                      where i.cobro_id = c.id and not i.anulada) im on true
  left join lateral (select count(*)::int as n, array_agg(distinct m.forma order by m.forma) as formas,
                            string_agg(coalesce(m.cheque_numero, '') || ' ' || coalesce(m.cheque_librador, ''), ' ') as busq
                       from public.ventas_cobro_medios m where m.cobro_id = c.id) me on true
  left join lateral (select sum(x.n)::int as n,
                            jsonb_agg(jsonb_build_object('tipo', x.tipo, 'importe', x.importe) order by x.tipo) as resumen,
                            string_agg(x.certs, ' ') as busq
                       from (select r.tipo, count(*) as n, sum(r.importe) as importe,
                                    string_agg(r.certificado_numero, ' ') as certs
                               from public.ventas_cobro_retenciones r where r.cobro_id = c.id group by r.tipo) x) rt on true;
comment on view public.v_ventas_cobros is
  'Recibos (RC 0001-NNNNNNNN) con cliente, totales, cantidad de imputaciones vigentes, formas de pago y retenciones por tipo. 20260924m.';

-- ── Imputaciones con origen y destino legibles ────────────────────────

create view public.v_ventas_imputaciones with (security_invoker = true) as
select i.id, i.cobro_id, i.nc_factura_id, i.nc_externo_id, i.factura_id, i.externo_id, i.importe, i.fecha,
       i.anulada, i.anulada_por, i.anulada_el, i.anulada_motivo, i.created_at, i.created_by,
       pc.nombre as created_by_nombre, pa.nombre as anulada_por_nombre,
       case when i.cobro_id is not null then 'cobro' when i.nc_factura_id is not null then 'nc' else 'nc_externa' end as origen_tipo,
       case when i.cobro_id is not null then public._ventas_recibo_fmt(oc.numero)
            when i.nc_factura_id is not null then public._ventas_abrev_cbte(onf.cbte_tipo) || ' ' || public._ventas_numero_fmt(onf.pto_vta, onf.numero)
            else public._ventas_abrev_cbte(one.cbte_tipo) || ' ' || public._ventas_numero_fmt(one.pto_vta, one.numero) end as origen_fmt,
       case when i.factura_id is not null then 'factura' else 'externo' end as destino_tipo,
       coalesce(df.cliente_id, de.cliente_id) as cliente_id,
       coalesce(df.ambiente, 'prod') as ambiente,
       case when i.factura_id is not null then public._ventas_abrev_cbte(df.cbte_tipo) || ' ' || public._ventas_numero_fmt(df.pto_vta, df.numero)
            else public._ventas_abrev_cbte(de.cbte_tipo) || ' ' || public._ventas_numero_fmt(de.pto_vta, de.numero) end as destino_fmt,
       coalesce(df.fecha_cbte, de.fecha) as destino_fecha,
       coalesce(df.vence_el, de.vence_el) as destino_vence_el,
       coalesce(df.imp_total, de.total) as destino_total,
       s.saldo as destino_saldo_actual
  from public.ventas_imputaciones i
  left join public.ventas_cobros oc on oc.id = i.cobro_id
  left join public.ventas_facturas onf on onf.id = i.nc_factura_id
  left join public.ventas_comprobantes_externos one on one.id = i.nc_externo_id
  left join public.ventas_facturas df on df.id = i.factura_id
  left join public.ventas_comprobantes_externos de on de.id = i.externo_id
  left join public.profiles pc on pc.id = i.created_by
  left join public.profiles pa on pa.id = i.anulada_por
  left join public.ventas_saldos_al() s
         on s.naturaleza = 'debito'
        and ((i.factura_id is not null and s.factura_id = i.factura_id) or (i.externo_id is not null and s.externo_id = i.externo_id));
comment on view public.v_ventas_imputaciones is
  'Imputaciones con origen (RC / NC / NC externa) y destino formateados y el saldo actual del destino. 20260924m.';

-- ── Externos (saldos iniciales + libro de ventas histórico) ───────────

create view public.v_ventas_externos with (security_invoker = true) as
select e.id, e.cliente_id, e.cbte_tipo, e.tipo, e.letra, e.pto_vta, e.numero, e.fecha, e.vence_el,
       e.neto, e.no_gravado, e.exento, e.iva, e.total, e.moneda, e.tipo_cambio,
       e.rec_doc_tipo, e.rec_doc_nro, e.rec_razon_social,
       e.saldo_inicial, e.saldo_a_revisar, e.saldo_confirmado_por, e.saldo_confirmado_el, e.saldo_motivo, e.saldo_cobrado_el,
       e.origen, e.obs, e.created_at, e.updated_at, e.created_by, e.updated_by,
       public._ventas_abrev_cbte(e.cbte_tipo)  as tipo_abrev,
       public._ventas_nombre_cbte(e.cbte_tipo) as tipo_nombre,
       public._ventas_numero_fmt(e.pto_vta, e.numero) as numero_fmt,
       public._ventas_abrev_cbte(e.cbte_tipo) || ' ' || public._ventas_numero_fmt(e.pto_vta, e.numero) as comprobante,
       c.razon_social as cliente_razon_social, c.doc_nro as cliente_doc_nro,
       pc.nombre as saldo_confirmado_por_nombre,
       coalesce(s.aplicado, 0) as aplicado,
       coalesce(s.saldo, 0)    as saldo,
       s.estado, s.dias_vencido,
       coalesce(ni.n, 0) as cantidad_imputaciones,
       public.norm_txt(public._ventas_abrev_cbte(e.cbte_tipo) || ' ' || public._ventas_numero_fmt(e.pto_vta, e.numero) || ' '
                       || e.numero || ' ' || c.razon_social || ' ' || c.doc_nro || ' ' || coalesce(e.rec_razon_social, '') || ' '
                       || e.obs || ' ' || e.saldo_motivo) as busq
  from public.ventas_comprobantes_externos e
  join public.ventas_clientes c on c.id = e.cliente_id
  left join public.profiles pc on pc.id = e.saldo_confirmado_por
  left join public.ventas_saldos_al() s on s.externo_id = e.id
  left join lateral (select count(*)::int as n from public.ventas_imputaciones i
                      where (i.externo_id = e.id or i.nc_externo_id = e.id) and not i.anulada) ni on true;
comment on view public.v_ventas_externos is
  'Comprobantes externos (saldos iniciales y libro de ventas jul–sep 2026) con saldo actual y estado. 20260924m.';

-- ── v_ventas_facturas: vencimiento y saldo de cobro, al final ─────────

create or replace view public.v_ventas_facturas with (security_invoker = true) as
select f.id, f.ambiente, f.pto_vta, f.cbte_tipo, f.numero, f.numero_intentado, f.estado, f.concepto,
       f.fecha_cbte, f.fch_vto_pago, f.cliente_id,
       f.rec_razon_social, f.rec_doc_tipo, f.rec_doc_nro, f.rec_condicion_iva_id, f.rec_domicilio,
       f.obra_cod, f.producto, f.centro_costo, f.provincia_origen, f.provincia_destino, f.condicion_pago,
       f.remitos, f.observaciones, f.moneda, f.cotizacion,
       f.imp_neto, f.imp_iva, f.imp_trib, f.imp_op_ex, f.imp_tot_conc, f.imp_total,
       f.cae, f.cae_vto, f.resultado, f.observaciones_arca, f.errores_arca, f.intento_at, f.intento_n,
       f.emitida_por, f.emitida_at, f.numero_finnegans, f.registrada_at, f.registrada_por, f.obs_interna,
       f.created_at, f.updated_at, f.created_by, f.updated_by,
       case when f.cbte_tipo in (1, 3, 201, 203) then 'A' else 'B' end                         as letra,
       case f.cbte_tipo when 1 then 'Factura A' when 3 then 'Nota de Crédito A'
                        when 6 then 'Factura B' when 8 then 'Nota de Crédito B'
                        when 201 then 'Factura de Crédito Electrónica MiPyMEs A'
                        when 203 then 'Nota de Crédito Electrónica MiPyMEs A' end              as tipo_nombre,
       lpad(f.cbte_tipo::text, 3, '0')                                                          as cod_cbte,
       (f.cbte_tipo in (3, 8, 203))                                                             as es_nc,
       case when f.numero is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0') end       as numero_fmt,
       case when f.numero_intentado is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero_intentado::text, 8, '0') end as numero_intentado_fmt,
       (f.ambiente = 'homo')                                                                    as es_homologacion,
       (f.estado = 'autorizada' and f.numero_finnegans is null)                                 as pendiente_finnegans,
       to_char(f.fecha_cbte, 'YYYY-MM')                                                         as mes,
       c.razon_social as cliente_razon_social, c.activo as cliente_activo, c.email as cliente_email,
       o.nom as obra_nom,
       pc.nombre as created_by_nombre, pe.nombre as emitida_por_nombre, pr.nombre as registrada_por_nombre,
       coalesce(nc.total_nc, 0)::numeric(14,2)                                                  as nc_autorizadas,
       case when f.cbte_tipo not in (3, 8, 203) and f.estado = 'autorizada'
            then (f.imp_total - coalesce(nc.total_nc, 0))::numeric(14,2) end                     as saldo_nc,
       asoc.asociada_id,
       case when asoc.asociada_id is not null
            then lpad(asoc.pto_vta::text, 5, '0') || '-' || lpad(asoc.numero::text, 8, '0') end  as asociada_numero_fmt,
       asoc.cbte_tipo as asociada_cbte_tipo,
       public.norm_txt(coalesce(lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), '') || ' '
                       || coalesce(f.numero::text, '') || ' ' || f.rec_razon_social || ' ' || f.rec_doc_nro || ' '
                       || f.producto || ' ' || coalesce(f.centro_costo, '') || ' ' || coalesce(f.obra_cod, '') || ' '
                       || coalesce(o.nom, '') || ' ' || f.observaciones || ' ' || f.remitos || ' '
                       || coalesce(f.numero_finnegans, '') || ' ' || coalesce(f.cae, ''))       as busq,
       f.fce_cuenta_id, f.fce_cbu, f.fce_alias, f.fce_banco, f.fce_transmision, f.nc_anulacion,
       (f.cbte_tipo in (201, 202, 203))                                                         as es_fce,
       asoc.fecha_cbte                                                                          as asociada_fecha_cbte,
       f.fce_referencia,
       -- 20260924m: cobranzas. Solo autorizadas; en una NC, cobro_saldo = crédito libre.
       f.vence_el, f.vence_el_manual,
       s.saldo                                                                                  as cobro_saldo,
       s.aplicado                                                                               as cobro_aplicado,
       case when s.naturaleza = 'debito' and s.saldo > 0 and s.dias_vencido > 0 then 'vencida'
            else s.estado end                                                                   as cobro_estado,
       s.dias_vencido                                                                           as cobro_dias_vencido
from public.ventas_facturas f
join public.ventas_clientes c on c.id = f.cliente_id
left join public.obras o on o.cod = f.obra_cod
left join public.profiles pc on pc.id = f.created_by
left join public.profiles pe on pe.id = f.emitida_por
left join public.profiles pr on pr.id = f.registrada_por
left join lateral (
  select sum(n.imp_total) as total_nc
    from public.ventas_factura_asociados a join public.ventas_facturas n on n.id = a.factura_id
   where a.asociada_id = f.id and n.estado = 'autorizada') nc on true
left join lateral (
  select a.asociada_id, a.pto_vta, a.numero, a.cbte_tipo, a.fecha_cbte
    from public.ventas_factura_asociados a where a.factura_id = f.id order by a.id limit 1) asoc on true
left join public.ventas_saldos_al() s on s.factura_id = f.id;

-- ── Grants ────────────────────────────────────────────────────────────
do $$
declare v text;
begin
  foreach v in array array['v_ventas_saldos', 'v_ventas_creditos', 'v_ventas_deudores', 'v_ventas_cobros',
                           'v_ventas_imputaciones', 'v_ventas_externos', 'v_ventas_facturas'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v);
    execute format('grant select on table public.%I to service_role', v);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['_ventas_abrev_cbte(smallint)', '_ventas_nombre_cbte(smallint)',
                           '_ventas_numero_fmt(int, bigint)', '_ventas_recibo_fmt(bigint)',
                           'ventas_saldos_al(date, bigint, text)', 'ventas_deudores_al(date, text)',
                           'ventas_estado_cuenta(bigint, date, date, text)', 'fn_ventas_cobros_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
