-- =====================================================================
-- Compras: período IVA de la factura de proveedor (2026-09-27)
--
-- Por qué: pedido del contador (24/09). Una factura que llega tarde (el mes
-- de su fecha ya se presentó) se informa en el Libro IVA compras de un mes
-- POSTERIOR. Hasta hoy el libro filtraba por `fecha`; desde esta migración
-- filtra por `periodo_iva` (el backend cambia en el mismo deploy).
--
-- 1) pagos_facturas.periodo_iva (día 1 del mes), backfill = mes de la fecha,
--    NOT NULL y dos CHECK (es día 1; nunca anterior al mes de la fecha).
--    Las fechas se truncan como `timestamp` (sin zona) para que el CHECK no
--    dependa del TimeZone de la sesión.
-- 2) _pagos_periodo_iva_sugerido(fecha): el mes de la fecha, salvo que ese
--    mes esté CERRADO en Contabilidad: ahí el primer mes abierto siguiente.
--    Si no hay ninguno abierto después, el mes de la fecha (no inventa).
--    Es solo lectura de cont_periodos (excepción a §5.18, anotada).
-- 3) trg_pagos_periodo_iva (BEFORE INSERT OR UPDATE OF fecha, periodo_iva):
--    · INSERT sin valor → el sugerido. INSERT con valor → no puede ser un mes
--      cerrado (salvo el importador de ARCA, GUC cadinc.pagos_importar, que
--      pone el mes de la fecha a propósito).
--    · UPDATE que cambia la fecha sin tocar el período: si no estaba corrido,
--      sigue a la fecha (sugerido); si estaba corrido, greatest(período, mes
--      nuevo). Si el mes de la fecha no cambió, el período queda igual.
--    · UPDATE que cambia el período: ni el mes de origen ni el de destino
--      pueden estar cerrados (PERIODO_IVA_CERRADO, lado origen/destino).
--    · Escape: cadinc.descongelar = 'on', solo desde una migración.
-- 4) pagos_crear_factura toma p_factura->>'periodo_iva' (null = sugerido) y
--    pagos_editar_factura lo admite como campo editable. NO desaprueba ni se
--    congela con la factura pagada: es clasificación fiscal, como el concepto.
-- 5) v_pagos_facturas suma al final periodo_iva y periodo_iva_distinto.
--
-- Técnica (20260925k/n, 20260926g): definición VIVA + reemplazo contado; si
-- un ancla no aparece exactamente una vez, falla todo.
-- =====================================================================

-- ── 1) Columna, backfill y constraints ─────────────────────────────────
alter table public.pagos_facturas add column periodo_iva date;
-- Dispara trg_pagos_facturas_touch y audit_cambios sobre las filas actuales (aceptado).
update public.pagos_facturas set periodo_iva = date_trunc('month', fecha::timestamp)::date;
alter table public.pagos_facturas alter column periodo_iva set not null;
alter table public.pagos_facturas
  add constraint pagos_facturas_periodo_iva_mes_chk
    check (periodo_iva = date_trunc('month', periodo_iva::timestamp)::date),
  add constraint pagos_facturas_periodo_iva_fecha_chk
    check (periodo_iva >= date_trunc('month', fecha::timestamp)::date);
create index pagos_facturas_periodo_iva_idx on public.pagos_facturas (periodo_iva) where estado <> 'anulada';
comment on column public.pagos_facturas.periodo_iva is
  'Mes (día 1) en que el comprobante se informa en el Libro IVA compras y la posición. Default = mes de fecha; si ese mes está cerrado en Contabilidad, el primer mes abierto siguiente. Editable siempre (clasificación fiscal, como concepto_id). Nunca anterior al mes de fecha. Pedido del contador 24/09.';

-- ── 2) Sugerido ─────────────────────────────────────────────────────────
create or replace function public._pagos_periodo_iva_cerrado(p_mes date)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.cont_periodos p
                  where p_mes between p.desde and p.hasta and p.estado = 'cerrado')
$$;

create or replace function public._pagos_periodo_iva_sugerido(p_fecha date)
returns date language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m date := date_trunc('month', p_fecha::timestamp)::date;
  v date;
begin
  if p_fecha is null then return null; end if;
  if public._pagos_periodo_iva_cerrado(m) then
    select min(p.desde) into v from public.cont_periodos p where p.desde > m and p.estado = 'abierto';
    return coalesce(v, m);
  end if;
  return m;
end $$;

comment on function public._pagos_periodo_iva_sugerido(date) is
  'Período IVA sugerido para una fecha de comprobante: su mes, o el primer mes abierto siguiente si ese mes está cerrado en Contabilidad (20260927a).';

-- ── 3) Trigger ──────────────────────────────────────────────────────────
create or replace function public.fn_pagos_periodo_iva()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_mes      date := date_trunc('month', new.fecha::timestamp)::date;
  v_mes_old  date;
  v_escape   boolean := coalesce(current_setting('cadinc.descongelar', true), '') = 'on';
  v_importar boolean := coalesce(current_setting('cadinc.pagos_importar', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.periodo_iva is null then
      new.periodo_iva := public._pagos_periodo_iva_sugerido(new.fecha);
    elsif not v_importar and not v_escape
          and public._pagos_periodo_iva_cerrado(date_trunc('month', new.periodo_iva::timestamp)::date) then
      raise exception 'PERIODO_IVA_CERRADO' using errcode = 'P0001',
        detail = json_build_object('campo', 'periodo_iva', 'periodo', new.periodo_iva, 'lado', 'destino')::text;
    end if;
  else
    v_mes_old := date_trunc('month', old.fecha::timestamp)::date;
    if new.fecha is distinct from old.fecha and new.periodo_iva is not distinct from old.periodo_iva
       and v_mes <> v_mes_old then
      if old.periodo_iva = v_mes_old then
        new.periodo_iva := public._pagos_periodo_iva_sugerido(new.fecha);
      else
        new.periodo_iva := greatest(old.periodo_iva, v_mes);
      end if;
    end if;
  end if;

  if new.periodo_iva is null then
    raise exception 'PERIODO_IVA_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'periodo_iva', 'periodo_iva', null)::text;
  end if;
  if new.periodo_iva <> date_trunc('month', new.periodo_iva::timestamp)::date then
    raise exception 'PERIODO_IVA_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'periodo_iva', 'periodo_iva', new.periodo_iva)::text;
  end if;
  if new.periodo_iva < v_mes then
    raise exception 'PERIODO_IVA_ANTERIOR_A_FECHA' using errcode = 'P0001',
      detail = json_build_object('campo', 'periodo_iva', 'periodo_iva', new.periodo_iva, 'fecha', new.fecha)::text;
  end if;

  if tg_op = 'UPDATE' and new.periodo_iva is distinct from old.periodo_iva and not v_escape then
    if public._pagos_periodo_iva_cerrado(old.periodo_iva) then
      raise exception 'PERIODO_IVA_CERRADO' using errcode = 'P0001',
        detail = json_build_object('campo', 'periodo_iva', 'periodo', old.periodo_iva, 'lado', 'origen')::text;
    end if;
    if public._pagos_periodo_iva_cerrado(new.periodo_iva) then
      raise exception 'PERIODO_IVA_CERRADO' using errcode = 'P0001',
        detail = json_build_object('campo', 'periodo_iva', 'periodo', new.periodo_iva, 'lado', 'destino')::text;
    end if;
  end if;
  return new;
end $$;

create trigger trg_pagos_periodo_iva before insert or update of fecha, periodo_iva on public.pagos_facturas
  for each row execute function public.fn_pagos_periodo_iva();

-- ── 4) RPC de alta y edición (anclas sobre la definición viva) ─────────
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
  v text := pg_get_functiondef('public.pagos_crear_factura(jsonb,jsonb,uuid,jsonb)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$lectura_estado, lectura_json, clase, concepto_id)$a$,
$a$lectura_estado, lectura_json, clase, concepto_id, periodo_iva)$a$);
  v := pg_temp._una(v,
$a$            v_clase, v_concepto)$a$,
$a$            v_clase, v_concepto, nullif(btrim(coalesce(p_factura ->> 'periodo_iva', '')), '')::date)$a$);
  execute v;
end $m$;

do $m$
declare
  v text := pg_get_functiondef('public.pagos_editar_factura(bigint,jsonb,jsonb,text,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$'no_gravado','exento','cae','cae_vto','cbte_tipo_arca','concepto_id'];$a$,
$a$'no_gravado','exento','cae','cae_vto','cbte_tipo_arca','concepto_id','periodo_iva'];$a$);
  execute v;
end $m$;

-- ── 5) v_pagos_facturas: columnas al final ─────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_facturas'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$)) AS concepto
   FROM $a$,
$a$)) AS concepto,
    f.periodo_iva,
    (f.periodo_iva <> (date_trunc('month'::text, (f.fecha)::timestamp without time zone))::date) AS periodo_iva_distinto
   FROM $a$);
  execute 'create or replace view public.v_pagos_facturas as ' || v;
end $m$;

drop function pg_temp._una(text, text, text);

-- ── 6) Grants: solo service_role ───────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_pagos_periodo_iva_cerrado(date)',
    '_pagos_periodo_iva_sugerido(date)',
    'fn_pagos_periodo_iva()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
