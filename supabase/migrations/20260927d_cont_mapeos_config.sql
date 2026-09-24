-- =====================================================================
-- Contabilidad fase 3: configuración y mapeos de cuentas (2026-09-27)
--
-- Por qué: el motor de asientos automáticos (20260927e/f) NO inventa cuentas.
-- Todo lo que necesita sale de acá:
--   · cont_config: parámetros del motor (desde cuándo contabiliza, cómo trata
--     las CVLP, qué fecha usa en las compras con período IVA corrido y qué
--     hace con las facturas que paga el cliente — null = pendiente, P3.4).
--   · cont_mapeos: (clave, subclave) → cuenta. Las claves son un catálogo
--     fijo (_cont_mapeo_reglas) con los rubros y auxiliares que admite cada
--     una. Sin mapeo, el origen queda PENDIENTE con motivo SIN_MAPEO.
--   · ventas_comprobantes_externos.liquido: lo que liquida el comisionista
--     de una CVLP (Casilda) después de su comisión; el asiento de una CVLP va
--     por el neto liquidado (contador 24/09, P3.2).
--
-- Funciona con cualquier plan: se mapea después de importar el plan.
-- Escritura solo por RPC (flag editar_mapeos). Grants solo service_role.
-- =====================================================================

-- ── 1) Tablas ──────────────────────────────────────────────────────────
create table public.cont_config (
  clave      text primary key check (clave in ('automaticos_desde', 'cvlp_modo', 'compras_fecha_contable', 'paga_cliente_modo')),
  valor      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.cont_config (clave, valor, updated_at, updated_by) values
  ('automaticos_desde',      '"2026-07-01"',     now(), null),
  ('cvlp_modo',              '"neto_liquidado"', now(), null),   -- 'neto_liquidado' | 'bruto'
  ('compras_fecha_contable', '"mes_iva"',        now(), null),   -- 'fecha' | 'mes_iva'
  ('paga_cliente_modo',      'null',             now(), null);   -- null = pendiente (P3.4)

create table public.cont_mapeos (
  id          bigserial primary key,
  clave       text not null check (clave in ('compras.concepto', 'compras.sin_imputar', 'compras.iva_cf', 'compras.tributo',
                'compras.proveedores', 'ventas.producto', 'ventas.externo', 'ventas.iva_df', 'ventas.tributo',
                'ventas.deudores', 'cobros.medio', 'cobros.retencion', 'pagos.puente', 'pagos.cheque_propio',
                'pagos.cheque_tercero', 'general.redondeo')),
  subclave    text not null default '',
  cuenta_id   bigint not null references public.cont_cuentas(id),
  obs         text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  unique (clave, subclave)
);
create index cont_mapeos_cuenta_idx on public.cont_mapeos (cuenta_id);
comment on table public.cont_mapeos is
  'Qué cuenta usa el motor de asientos automáticos para cada (clave, subclave). Catálogo de claves en _cont_mapeo_reglas(). 20260927d.';

alter table public.ventas_comprobantes_externos
  add column liquido numeric(14,2) check (liquido is null or (liquido > 0 and liquido <= total)),
  add constraint ventas_externos_liquido_cvlp_chk check (liquido is null or cbte_tipo in (60, 61));
comment on column public.ventas_comprobantes_externos.liquido is
  'Solo CVLP (060/061): lo que liquida el comisionista (Casilda) después de su comisión. El asiento va por el neto liquidado (contador 24/09).';

-- ── 2) Catálogo de claves ──────────────────────────────────────────────
-- subclave_tipo: 'fija' (solo las de la lista), 'concepto' (id de
-- pagos_conceptos), 'tributo_compra' / 'retencion' (tipo o tipo|jurisdicción
-- normalizada con norm_txt), 'cbte_externo' (código de comprobante o '').
create or replace function public._cont_mapeo_reglas()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select '[
    {"clave":"compras.concepto","etiqueta":"Compras: gasto por concepto","descripcion":"Cuenta de gasto (o de activo) de cada concepto de compra. El importe se reparte por obra según la imputación de la factura.","rubros":["egreso","activo"],"auxiliares":["none"],"subclave_tipo":"concepto","subclaves":[],"lookup":"exacto"},
    {"clave":"compras.sin_imputar","etiqueta":"Compras sin imputar","descripcion":"Cuenta transitoria («Compras a clasificar») de las facturas importadas de ARCA que todavía no tienen concepto ni obra.","rubros":["egreso","activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"compras.iva_cf","etiqueta":"IVA crédito fiscal","descripcion":"Por alícuota, o una sola cuenta para todas (General).","rubros":["activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","3","4","5","6","8","9"],"lookup":"alicuota → general"},
    {"clave":"compras.tributo","etiqueta":"Percepciones e impuestos de compras","descripcion":"Por tipo de tributo, y opcionalmente por tipo y jurisdicción. «Otros tributos» son los de ARCA sin clasificar.","rubros":["activo","egreso"],"auxiliares":["none"],"subclave_tipo":"tributo_compra","subclaves":["percepcion_iva","percepcion_iibb","percepcion_ganancias","percepcion_municipal","impuestos_internos","otro"],"lookup":"tipo|jurisdicción → tipo"},
    {"clave":"compras.proveedores","etiqueta":"Proveedores","descripcion":"Pasivo con los proveedores de Compras. Si la cuenta lleva auxiliar, tiene que ser de proveedor.","rubros":["pasivo"],"auxiliares":["proveedor","none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"ventas.producto","etiqueta":"Ventas por producto","descripcion":"Ingreso de las facturas emitidas desde el ERP, por producto.","rubros":["ingreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["AVANCE DE OBRA","TRANSPORTE"],"lookup":"exacto"},
    {"clave":"ventas.externo","etiqueta":"Ventas externas (ARCA)","descripcion":"Ingreso de los comprobantes externos (importados de ARCA o saldos iniciales). Por código de comprobante (60/61 = CVLP) o General.","rubros":["ingreso"],"auxiliares":["none"],"subclave_tipo":"cbte_externo","subclaves":["","60","61"],"lookup":"comprobante → general"},
    {"clave":"ventas.iva_df","etiqueta":"IVA débito fiscal","descripcion":"Por alícuota, o una sola cuenta para todas (General).","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","3","4","5","6","8","9"],"lookup":"alicuota → general"},
    {"clave":"ventas.tributo","etiqueta":"Otros tributos de ventas","descripcion":"Tributos (percepciones) que CADINC cobra en sus facturas.","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"ventas.deudores","etiqueta":"Deudores por ventas","descripcion":"Crédito con los clientes. Si la cuenta lleva auxiliar, tiene que ser de cliente.","rubros":["activo"],"auxiliares":["cliente","none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"cobros.medio","etiqueta":"Cobros por medio","descripcion":"Cuenta de cada forma de cobro. Las transferencias van a la cuenta contable de la cuenta de tesorería vinculada a la cuenta bancaria; este mapeo es el respaldo.","rubros":["activo"],"auxiliares":["none","tesoreria"],"subclave_tipo":"fija","subclaves":["efectivo","cheque","echeq","transferencia","otro"],"lookup":"exacto"},
    {"clave":"cobros.retencion","etiqueta":"Retenciones sufridas en cobros","descripcion":"Por tipo de retención, y opcionalmente por tipo y jurisdicción.","rubros":["activo"],"auxiliares":["none"],"subclave_tipo":"retencion","subclaves":["iibb","tem","suss","ganancias","iva","otra"],"lookup":"tipo|jurisdicción → tipo"},
    {"clave":"pagos.puente","etiqueta":"Pagos sin cuenta de origen","descripcion":"Cuenta puente de las órdenes de pago que no indican de qué cuenta salió la plata.","rubros":["activo","pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"pagos.cheque_propio","etiqueta":"Cheques propios entregados","descripcion":"Cheques y e-cheqs propios con que se paga (por ejemplo, «Cheques diferidos emitidos»).","rubros":["pasivo","activo"],"auxiliares":["none","tesoreria"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"pagos.cheque_tercero","etiqueta":"Cheques de terceros entregados","descripcion":"Cheques de terceros endosados al pagar (sale de «Valores a depositar»).","rubros":["activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},
    {"clave":"general.redondeo","etiqueta":"Redondeo","descripcion":"Diferencias de hasta $0,05 por redondeo (moneda extranjera, alícuotas).","rubros":["ingreso","egreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"}
  ]'::jsonb
$$;

create or replace function public._cont_mapeo_regla(p_clave text)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select r from jsonb_array_elements(public._cont_mapeo_reglas()) r where r ->> 'clave' = p_clave
$$;

create or replace function public._cont_subclave_valida(p_clave text, p_sub text)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare
  r      jsonb := public._cont_mapeo_regla(p_clave);
  v_tipo text;
  v_jur  text;
begin
  if r is null or p_sub is null then return false; end if;
  case r ->> 'subclave_tipo'
    when 'fija' then
      return (r -> 'subclaves') ? p_sub;
    when 'concepto' then
      return p_sub ~ '^[0-9]{1,18}$' and exists (select 1 from public.pagos_conceptos c where c.id = p_sub::bigint);
    when 'tributo_compra', 'retencion' then
      if array_length(string_to_array(p_sub, '|'), 1) > 2 then return false; end if;
      v_tipo := split_part(p_sub, '|', 1);
      if not ((r -> 'subclaves') ? v_tipo) then return false; end if;
      if position('|' in p_sub) = 0 then return true; end if;
      v_jur := split_part(p_sub, '|', 2);
      return v_jur <> '' and v_jur = public.norm_txt(v_jur);
    when 'cbte_externo' then
      return p_sub = '' or (p_sub ~ '^[0-9]{1,3}$' and p_sub::int in (1, 2, 3, 6, 7, 8, 60, 61, 201, 202, 203));
    else
      return false;
  end case;
end $$;

create or replace function public._cont_subclave_etiqueta(p_clave text, p_sub text)
returns text language sql stable set search_path = public, pg_temp as $$
  select case
    when p_clave = 'compras.concepto' then
      coalesce((select c.nombre || case when c.activo then '' else ' (baja)' end
                  from public.pagos_conceptos c where p_sub ~ '^[0-9]{1,18}$' and c.id = p_sub::bigint), 'Concepto ' || p_sub)
    when p_clave in ('compras.iva_cf', 'ventas.iva_df') then
      case p_sub when '' then 'General (todas las alícuotas)' when '3' then 'IVA 0 %' when '4' then 'IVA 10,5 %'
                 when '5' then 'IVA 21 %' when '6' then 'IVA 27 %' when '8' then 'IVA 5 %' when '9' then 'IVA 2,5 %'
                 else 'Alícuota ' || p_sub end
    when p_clave = 'compras.tributo' then
      case split_part(p_sub, '|', 1)
        when 'percepcion_iva' then 'Percepción IVA' when 'percepcion_iibb' then 'Percepción IIBB'
        when 'percepcion_ganancias' then 'Percepción Ganancias' when 'percepcion_municipal' then 'Percepción municipal'
        when 'impuestos_internos' then 'Impuestos internos' when 'otro' then 'Otros tributos (sin clasificar)'
        else split_part(p_sub, '|', 1) end
      || case when position('|' in p_sub) > 0 then ' · ' || split_part(p_sub, '|', 2) else '' end
    when p_clave = 'cobros.retencion' then
      case split_part(p_sub, '|', 1)
        when 'iibb' then 'Retención IIBB' when 'tem' then 'Retención TEM' when 'suss' then 'Retención SUSS'
        when 'ganancias' then 'Retención Ganancias' when 'iva' then 'Retención IVA' when 'otra' then 'Otra retención'
        else split_part(p_sub, '|', 1) end
      || case when position('|' in p_sub) > 0 then ' · ' || split_part(p_sub, '|', 2) else '' end
    when p_clave = 'ventas.externo' then
      case p_sub when '' then 'General' when '60' then 'CVLP A (60)' when '61' then 'CVLP B (61)'
                 else 'Comprobante ' || p_sub end
    when p_clave = 'cobros.medio' then
      case p_sub when 'efectivo' then 'Efectivo' when 'cheque' then 'Cheque' when 'echeq' then 'E-cheq'
                 when 'transferencia' then 'Transferencia (respaldo sin cuenta vinculada)' when 'otro' then 'Otro'
                 else p_sub end
    when p_sub = '' then 'General'
    else p_sub
  end
$$;

-- La cuenta de un mapeo, probando las subclaves en orden (de la más
-- específica a la general). Solo cuentas activas e imputables.
create or replace function public._cont_cuenta_mapeada(p_clave text, p_subclaves text[])
returns bigint language sql stable set search_path = public, pg_temp as $$
  select m.cuenta_id
    from unnest(p_subclaves) with ordinality as s(sub, n)
    join public.cont_mapeos m on m.clave = p_clave and m.subclave = s.sub
    join public.cont_cuentas c on c.id = m.cuenta_id and c.activo and c.imputable
   order by s.n
   limit 1
$$;

-- ── 3) Configuración ───────────────────────────────────────────────────
create or replace function public._cont_cfg(p_clave text)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select valor from public.cont_config where clave = p_clave
$$;

create or replace function public._cont_cfg_desde()
returns date language sql stable set search_path = public, pg_temp as $$
  select coalesce((public._cont_cfg('automaticos_desde') #>> '{}')::date, '2026-07-01'::date)
$$;

create or replace function public.cont_config_json()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'automaticos_desde',      public._cont_cfg('automaticos_desde') #>> '{}',
    'cvlp_modo',              public._cont_cfg('cvlp_modo') #>> '{}',
    'compras_fecha_contable', public._cont_cfg('compras_fecha_contable') #>> '{}',
    'paga_cliente_modo',      public._cont_cfg('paga_cliente_modo') #>> '{}')
$$;

create or replace function public.cont_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_k   text;
  v_v   jsonb;
  v_d   date;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_mapeos') then
    raise exception 'SIN_PERMISO_MAPEOS' using errcode = 'P0001';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;
  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'automaticos_desde' then
        begin
          v_d := (v_v #>> '{}')::date;
        exception when others then v_d := null;
        end;
        if v_d is null or v_d < date '2026-07-01' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
        v_v := to_jsonb(v_d::text);
      when 'cvlp_modo' then
        if coalesce(v_v #>> '{}', '') not in ('neto_liquidado', 'bruto') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'compras_fecha_contable' then
        if coalesce(v_v #>> '{}', '') not in ('fecha', 'mes_iva') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'paga_cliente_modo' then
        -- Pendiente de la decisión del contador (P3.4): hoy solo admite null.
        if jsonb_typeof(v_v) <> 'null' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k)::text;
    end case;
    update public.cont_config set valor = v_v, updated_by = p_user_id where clave = v_k;
  end loop;
  return public.cont_config_json();
end $$;

-- ── 4) Listado de mapeos (catálogo para la pantalla) ───────────────────
-- en_uso: cantidad de orígenes desde automaticos_desde que usan esa subclave
-- (aproximado: el motor prueba primero la subclave específica).
create or replace function public._cont_mapeo_en_uso(p_clave text, p_sub text, p_desde date)
returns int language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_n int := 0;
  v_tipo text := split_part(p_sub, '|', 1);
  v_jur  text := nullif(split_part(p_sub, '|', 2), '');
begin
  case p_clave
    when 'compras.concepto' then
      select count(*) into v_n from public.pagos_facturas f
       where f.estado <> 'anulada' and f.fecha >= p_desde and not f.sin_imputar
         and p_sub ~ '^[0-9]{1,18}$' and f.concepto_id = p_sub::bigint;
    when 'compras.sin_imputar' then
      select count(*) into v_n from public.pagos_facturas f where f.estado <> 'anulada' and f.fecha >= p_desde and f.sin_imputar;
    when 'compras.iva_cf' then
      select count(distinct f.id) into v_n from public.pagos_facturas f
       where f.estado <> 'anulada' and f.fecha >= p_desde and f.tipo_comprobante = 'A'
         and (case when p_sub = '' then coalesce(f.iva, 0) > 0
                   else exists (select 1 from public.pagos_factura_iva i where i.factura_id = f.id and i.alicuota_id::text = p_sub) end);
    when 'compras.tributo' then
      select count(distinct t.factura_id) into v_n from public.pagos_factura_tributos t
        join public.pagos_facturas f on f.id = t.factura_id
       where f.estado <> 'anulada' and f.fecha >= p_desde and t.tipo = v_tipo
         and (v_jur is null or public.norm_txt(t.jurisdiccion) = v_jur);
    when 'compras.proveedores' then
      select (select count(*) from public.pagos_facturas f where f.estado <> 'anulada' and f.fecha >= p_desde)
           + (select count(*) from public.pagos_ordenes o where o.estado = 'emitida' and o.fecha >= p_desde and o.monto_pagado > 0)
        into v_n;
    when 'ventas.producto' then
      select count(*) into v_n from public.ventas_facturas v
       where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= p_desde and v.producto = p_sub;
    when 'ventas.externo' then
      select count(*) into v_n from public.ventas_comprobantes_externos x
       where x.fecha >= p_desde and (p_sub = '' or x.cbte_tipo::text = p_sub);
    when 'ventas.iva_df' then
      select (select count(distinct a.factura_id) from public.ventas_factura_alicuotas a
                join public.ventas_facturas v on v.id = a.factura_id
               where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= p_desde
                 and (p_sub = '' or a.alicuota_id::text = p_sub))
           + case when p_sub = '' then (select count(*) from public.ventas_comprobantes_externos x where x.fecha >= p_desde and x.iva > 0) else 0 end
        into v_n;
    when 'ventas.tributo' then
      select count(*) into v_n from public.ventas_facturas v
       where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= p_desde and v.imp_trib > 0;
    when 'ventas.deudores' then
      select (select count(*) from public.ventas_facturas v where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= p_desde)
           + (select count(*) from public.ventas_comprobantes_externos x where x.fecha >= p_desde)
           + (select count(*) from public.ventas_cobros c where c.ambiente = 'prod' and c.estado = 'vigente' and c.fecha >= p_desde)
        into v_n;
    when 'cobros.medio' then
      select count(distinct m.cobro_id) into v_n from public.ventas_cobro_medios m
        join public.ventas_cobros c on c.id = m.cobro_id
       where c.ambiente = 'prod' and c.estado = 'vigente' and c.fecha >= p_desde and m.forma = p_sub;
    when 'cobros.retencion' then
      select count(distinct r.cobro_id) into v_n from public.ventas_cobro_retenciones r
        join public.ventas_cobros c on c.id = r.cobro_id
       where c.ambiente = 'prod' and c.estado = 'vigente' and c.fecha >= p_desde and r.tipo = v_tipo
         and (v_jur is null or public.norm_txt(r.jurisdiccion) = v_jur);
    when 'pagos.puente' then
      select count(*) into v_n from public.pagos_ordenes o
       where o.estado = 'emitida' and o.fecha >= p_desde and o.monto_pagado > 0
         and o.forma_pago not in ('cheque', 'echeq', 'nota_credito') and o.cuenta_origen_id is null;
    when 'pagos.cheque_propio' then
      select count(distinct o.id) into v_n from public.pagos_ordenes o join public.pagos_cheques q on q.orden_id = o.id
       where o.estado = 'emitida' and o.fecha >= p_desde and q.es_propio;
    when 'pagos.cheque_tercero' then
      select count(distinct o.id) into v_n from public.pagos_ordenes o join public.pagos_cheques q on q.orden_id = o.id
       where o.estado = 'emitida' and o.fecha >= p_desde and not q.es_propio;
    else
      v_n := 0;
  end case;
  return coalesce(v_n, 0);
end $$;

create or replace function public.cont_mapeos_listar()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_desde date := public._cont_cfg_desde();
  v_out   jsonb := '[]'::jsonb;
  r       jsonb;
  v_subs  text[];
begin
  for r in select e from jsonb_array_elements(public._cont_mapeo_reglas()) e loop
    -- Fijas + las que existen en los datos + las ya mapeadas.
    select array_agg(distinct s order by s) into v_subs from (
      select jsonb_array_elements_text(r -> 'subclaves') as s
      union select m.subclave from public.cont_mapeos m where m.clave = r ->> 'clave'
      union select c.id::text from public.pagos_conceptos c where r ->> 'clave' = 'compras.concepto'
      union select t.tipo || '|' || public.norm_txt(t.jurisdiccion) from public.pagos_factura_tributos t
             where r ->> 'clave' = 'compras.tributo' and public.norm_txt(t.jurisdiccion) <> ''
      union select t.tipo || '|' || public.norm_txt(t.jurisdiccion) from public.ventas_cobro_retenciones t
             where r ->> 'clave' = 'cobros.retencion' and public.norm_txt(t.jurisdiccion) <> ''
      union select x.cbte_tipo::text from public.ventas_comprobantes_externos x where r ->> 'clave' = 'ventas.externo'
      union select a.alicuota_id::text from public.pagos_factura_iva a where r ->> 'clave' = 'compras.iva_cf'
      union select a.alicuota_id::text from public.ventas_factura_alicuotas a where r ->> 'clave' = 'ventas.iva_df'
    ) q;

    v_out := v_out || jsonb_build_object(
      'clave', r ->> 'clave', 'etiqueta', r ->> 'etiqueta', 'descripcion', r ->> 'descripcion',
      'rubros', r -> 'rubros', 'auxiliares', r -> 'auxiliares',
      'subclaves', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'subclave', s.sub,
                 'etiqueta', public._cont_subclave_etiqueta(r ->> 'clave', s.sub),
                 'mapeo_id', m.id, 'cuenta_id', m.cuenta_id, 'cuenta_codigo', c.codigo, 'cuenta_nombre', c.nombre,
                 'en_uso', public._cont_mapeo_en_uso(r ->> 'clave', s.sub, v_desde))
               order by case when s.sub = '' then 0 else 1 end, s.n)
          from unnest(v_subs) with ordinality as s(sub, n)
          left join public.cont_mapeos m on m.clave = r ->> 'clave' and m.subclave = s.sub
          left join public.cont_cuentas c on c.id = m.cuenta_id), '[]'::jsonb));
  end loop;
  return jsonb_build_object('claves', v_out);
end $$;

-- ── 5) Guardar mapeos ──────────────────────────────────────────────────
create or replace function public.cont_guardar_mapeos(p_mapeos jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_e    jsonb;
  v_i    int;
  v_cla  text;
  v_sub  text;
  v_cta  bigint;
  v_c    public.cont_cuentas%rowtype;
  r      jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_mapeos') then
    raise exception 'SIN_PERMISO_MAPEOS' using errcode = 'P0001';
  end if;
  if p_mapeos is null or jsonb_typeof(p_mapeos) <> 'array' or jsonb_array_length(p_mapeos) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_mapeos) > 500 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 500)::text;
  end if;

  for v_e, v_i in select e, (n - 1)::int from jsonb_array_elements(p_mapeos) with ordinality as t(e, n) loop
    v_cla := btrim(coalesce(v_e ->> 'clave', ''));
    v_sub := coalesce(v_e ->> 'subclave', '');
    r := public._cont_mapeo_regla(v_cla);
    if r is null then
      raise exception 'CLAVE_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub)::text;
    end if;
    if not public._cont_subclave_valida(v_cla, v_sub) then
      raise exception 'SUBCLAVE_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub)::text;
    end if;
    begin
      v_cta := nullif(v_e ->> 'cuenta_id', '')::bigint;
    exception when others then
      raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_e -> 'cuenta_id')::text;
    end;

    if v_cta is null then
      delete from public.cont_mapeos where clave = v_cla and subclave = v_sub;
      continue;
    end if;

    select * into v_c from public.cont_cuentas where id = v_cta;
    if not found then
      raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_cta)::text;
    end if;
    if not v_c.activo then
      raise exception 'CUENTA_INACTIVA' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_cta, 'codigo', v_c.codigo)::text;
    end if;
    if not v_c.imputable then
      raise exception 'CUENTA_NO_IMPUTABLE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_cta, 'codigo', v_c.codigo)::text;
    end if;
    if not ((r -> 'rubros') ? v_c.rubro) or not ((r -> 'auxiliares') ? v_c.auxiliar) then
      raise exception 'MAPEO_CUENTA_INCOMPATIBLE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_cta,
                                   'rubro', v_c.rubro, 'auxiliar', v_c.auxiliar,
                                   'permitidos', json_build_object('rubros', r -> 'rubros', 'auxiliares', r -> 'auxiliares'))::text;
    end if;

    insert into public.cont_mapeos (clave, subclave, cuenta_id, obs, created_by, updated_by)
    values (v_cla, v_sub, v_cta, coalesce(v_e ->> 'obs', ''), p_user_id, p_user_id)
    on conflict (clave, subclave) do update
      set cuenta_id = excluded.cuenta_id, updated_by = p_user_id,
          obs = case when v_e ? 'obs' then excluded.obs else cont_mapeos.obs end
      where cont_mapeos.cuenta_id is distinct from excluded.cuenta_id or (v_e ? 'obs' and cont_mapeos.obs is distinct from excluded.obs);
  end loop;

  return public.cont_mapeos_listar();
end $$;

-- ── 6) Auditoría, RLS y grants ─────────────────────────────────────────
create trigger trg_cont_config_touch before update on public.cont_config
  for each row execute function public.set_updated_at();
create trigger trg_cont_mapeos_touch before update on public.cont_mapeos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.cont_config
  for each row execute function public.audit_cambios('contabilidad', 'config contable', 'clave');
create trigger trg_audit_cambios after update on public.cont_mapeos
  for each row execute function public.audit_cambios('contabilidad', 'mapeo contable', 'id');
create trigger trg_audit_borrado after delete on public.cont_mapeos
  for each row execute function public.audit_borrado('contabilidad', 'mapeo contable', 'id');

alter table public.cont_config enable row level security;
create policy cont_config_all on public.cont_config for all using (true) with check (true);
revoke all on table public.cont_config from public, anon, authenticated;
grant all on table public.cont_config to service_role;

alter table public.cont_mapeos enable row level security;
create policy cont_mapeos_all on public.cont_mapeos for all using (true) with check (true);
revoke all on table public.cont_mapeos from public, anon, authenticated;
grant all on table public.cont_mapeos to service_role;
revoke all on sequence public.cont_mapeos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.cont_mapeos_id_seq to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_mapeo_reglas()',
    '_cont_mapeo_regla(text)',
    '_cont_subclave_valida(text, text)',
    '_cont_subclave_etiqueta(text, text)',
    '_cont_cuenta_mapeada(text, text[])',
    '_cont_cfg(text)',
    '_cont_cfg_desde()',
    '_cont_mapeo_en_uso(text, text, date)',
    'cont_config_json()',
    'cont_guardar_config(jsonb, uuid)',
    'cont_mapeos_listar()',
    'cont_guardar_mapeos(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
