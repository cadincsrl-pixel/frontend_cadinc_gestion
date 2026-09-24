-- =====================================================================
-- Compras: importadas de meses ya pagados — «pago a reconstruir»
-- (2026-09-24, serie 20260928)
--
-- Por qué: el dueño decidió (opción A) importar de ARCA las compras de julio
-- y agosto 2026 (~630) para el Libro IVA y la contabilidad. En la realidad
-- YA ESTÁN PAGADAS; los pagos se reconstruyen más adelante con los extractos
-- bancarios. Mientras tanto no pueden figurar como deuda (~$790M falsos), ni
-- pedir aprobación, ni aparecer en los avisos de la campana.
--
-- Diseño:
--   · pagos_facturas.pago_a_reconstruir: MARCA DE ORIGEN, la pone solo el
--     importador (p_historica) y no se cambia nunca (guard). Además
--     CHECK: solo en origen_carga = 'arca_recibidos'.
--   · v_pagos_facturas.pago_a_reconstruir (última columna): el flag
--     EFECTIVO = marca ∧ no anulada ∧ todavía «debe» algo:
--       factura → saldo > 0 y no la paga el cliente;
--       NC      → total − lo aplicado (con reservas) > 0.
--     Así «se apaga solo» cuando una OP (o una NC) la deja en saldo 0, sin
--     trigger sobre las órdenes, y vuelve si la OP se anula (el pago
--     reconstruido se deshizo: vuelve a estar por reconstruir).
--     Toda lectura (bandeja, resumen, deuda) usa el EFECTIVO; la columna de
--     la tabla es solo historia.
--   · vencida = false para las marcadas (ya pagadas en la realidad).
--   · Deuda por proveedor (v_pagos_proveedor_saldo y v_pagos_proveedores):
--     las efectivas NO suman en saldo / saldo_aprobado / vencido /
--     facturas_abiertas / para_aprobar / nc_disponible; van aparte en
--     a_reconstruir y facturas_a_reconstruir (columnas nuevas al final).
--   · pagos_aprobar_factura: con el flag efectivo → FACTURA_A_RECONSTRUIR
--     (antes que FACTURA_SIN_IMPUTAR: aunque se imputen, no se aprueban; el
--     pago real ya ocurrió y la aprobación no aporta). Reconstruido el pago
--     (saldo 0) vuelve a ser aprobable, como cualquier «marcar pagada».
--   · pagos_importar_recibidos(+ p_historica boolean default false, AL FINAL)
--     y pagos_resumen(+ p_pago_a_reconstruir boolean default null, AL FINAL):
--     DROP + CREATE (una sola función, sin sobrecarga). El backend viejo
--     llama con parámetros nombrados sin los nuevos: resuelve a la misma
--     función con el default y el resultado es idéntico.
--   · NO se toca: Libro IVA compras, posición IVA, contabilidad (cont_*),
--     imputación. Siguen contando igual.
-- Técnica de anclas sobre la definición VIVA (20260925k).
-- Encontrado al hacerla: `create or replace view` REEMPLAZA las reloptions;
-- v_pagos_proveedor_saldo tiene security_invoker=true y se preserva
-- re-emitiendo las opciones vivas de cada vista.
-- =====================================================================

-- ── 1) Columnas ─────────────────────────────────────────────────────────
alter table public.pagos_facturas
  add column pago_a_reconstruir boolean not null default false,
  add constraint pagos_facturas_a_reconstruir_origen_chk
    check (not pago_a_reconstruir or origen_carga = 'arca_recibidos');

comment on column public.pagos_facturas.pago_a_reconstruir is
  'Importada de un mes YA PAGADO (importador con p_historica). Marca de origen, inmutable. El flag efectivo (sigue sin pagar en el sistema) es v_pagos_facturas.pago_a_reconstruir: no cuenta como deuda, no vence, no se aprueba. 20260928b.';

alter table public.pagos_importaciones
  add column historica boolean not null default false;

comment on column public.pagos_importaciones.historica is
  'La importación fue de meses ya pagados: sus facturas nacen pago_a_reconstruir. 20260928b.';

-- ── 2) Guarda de la marca ──────────────────────────────────────────────
create or replace function public.fn_pagos_a_reconstruir_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.pago_a_reconstruir and coalesce(current_setting('cadinc.pagos_importar', true), '') <> 'on' then
      raise exception 'A_RECONSTRUIR_SOLO_IMPORTADOR' using errcode = 'P0001';
    end if;
  elsif new.pago_a_reconstruir is distinct from old.pago_a_reconstruir then
    raise exception 'A_RECONSTRUIR_INMUTABLE' using errcode = 'P0001', detail = json_build_object('factura_id', old.id)::text;
  end if;
  return new;
end $$;

create trigger trg_pagos_a_reconstruir_guard before insert or update of pago_a_reconstruir on public.pagos_facturas
  for each row execute function public.fn_pagos_a_reconstruir_guard();

-- ── 3) Parches por ancla ───────────────────────────────────────────────
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

-- Re-emite una vista conservando sus reloptions vivas (security_invoker…).
create or replace function pg_temp._vista(p_nom text, p_def text) returns void
  language plpgsql as $f$
declare v_opt text;
begin
  select array_to_string(c.reloptions, ', ') into v_opt from pg_class c where c.oid = ('public.' || p_nom)::regclass;
  execute 'create or replace view public.' || p_nom
       || coalesce(' with (' || v_opt || ')', '') || ' as ' || p_def;
end $f$;

-- 3.a) v_pagos_facturas: vencida en false y el flag efectivo al final.
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_facturas'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$(f.vence_el < hoy_ar())) AS vencida$a$,
$a$(f.vence_el < hoy_ar()) AND (NOT f.pago_a_reconstruir)) AS vencida$a$);
  v := pg_temp._una(v,
$a$    f.importacion_id
   FROM $a$,
$a$    f.importacion_id,
    (f.pago_a_reconstruir AND (f.estado <> 'anulada'::text) AND
        CASE
            WHEN (f.clase = 'nota_credito'::text) THEN ((f.total - COALESCE(ncn.aplicado, (0)::numeric)) > 0.005)
            ELSE ((NOT f.paga_cliente) AND ((((f.total - COALESCE(pg.pagado, (0)::numeric)) - COALESCE(pg.acreditado, (0)::numeric)) - COALESCE(ncf.acreditado, (0)::numeric)) > 0.005))
        END) AS pago_a_reconstruir
   FROM $a$);
  perform pg_temp._vista('v_pagos_facturas', v);
end $m$;

-- 3.b) v_pagos_proveedor_saldo: las efectivas fuera de la deuda, aparte.
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_proveedor_saldo'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$'pagada_parcial'::text])))) s ON (true))$a$,
$a$'pagada_parcial'::text])) AND (NOT v.pago_a_reconstruir))) s ON (true))$a$);
  v := pg_temp._una(v,
$a$ac ON (true))
  WHERE (p.activo OR $a$,
$a$ac ON (true))
     LEFT JOIN LATERAL ( SELECT sum(v.saldo) AS a_reconstruir,
            count(*) FILTER (WHERE (v.clase = 'factura'::text)) AS facturas_a_reconstruir
           FROM v_pagos_facturas v
          WHERE ((v.proveedor_id = p.id) AND v.pago_a_reconstruir)) rc ON (true)
  WHERE (p.activo OR (COALESCE(rc.a_reconstruir, (0)::numeric) > (0)::numeric) OR $a$);
  v := pg_temp._una(v,
$a$    p.codigo AS proveedor_codigo
   FROM $a$,
$a$    p.codigo AS proveedor_codigo,
    (COALESCE(rc.a_reconstruir, (0)::numeric))::numeric(14,2) AS a_reconstruir,
    (COALESCE(rc.facturas_a_reconstruir, (0)::bigint))::integer AS facturas_a_reconstruir
   FROM $a$);
  perform pg_temp._vista('v_pagos_proveedor_saldo', v);
end $m$;

-- 3.c) v_pagos_proveedores: ídem (saldo del padrón de proveedores).
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_proveedores'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$'pagada_parcial'::text])))) s ON (true))$a$,
$a$'pagada_parcial'::text])) AND (NOT v.pago_a_reconstruir))) s ON (true))$a$);
  v := pg_temp._una(v,
$a$fc ON (true))$a$,
$a$fc ON (true))
     LEFT JOIN LATERAL ( SELECT sum(v.saldo) AS a_reconstruir,
            count(*) FILTER (WHERE (v.clase = 'factura'::text)) AS facturas_a_reconstruir
           FROM v_pagos_facturas v
          WHERE ((v.proveedor_id = p.id) AND v.pago_a_reconstruir)) rc ON (true)$a$);
  v := pg_temp._una(v,
$a$    p.padron_consultado_at
   FROM $a$,
$a$    p.padron_consultado_at,
    (COALESCE(rc.a_reconstruir, (0)::numeric))::numeric(14,2) AS a_reconstruir,
    (COALESCE(rc.facturas_a_reconstruir, (0)::bigint))::integer AS facturas_a_reconstruir
   FROM $a$);
  perform pg_temp._vista('v_pagos_proveedores', v);
end $m$;

-- 3.d) pagos_aprobar_factura: no se aprueba lo que se pagó fuera del sistema.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_aprobar_factura(bigint,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  -- 20260927b: sin concepto ni reparto no hay costo que validar.$a$,
$a$  -- 20260928b: importada de un mes ya pagado y todavía sin el pago
  -- reconstruido. Va antes que sin_imputar: imputarla no la vuelve aprobable.
  if v_f.pago_a_reconstruir
     and coalesce((select v.pago_a_reconstruir from public.v_pagos_facturas v where v.id = p_factura_id), false) then
    raise exception 'FACTURA_A_RECONSTRUIR' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  -- 20260927b: sin concepto ni reparto no hay costo que validar.$a$);
  execute v;
end $m$;

-- 3.e) pagos_importar_recibidos: + p_historica (al final, default false).
do $m$
declare
  v text := pg_get_functiondef('public.pagos_importar_recibidos(jsonb,uuid,boolean,text,text)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$p_hash text DEFAULT NULL::text)$a$,
$a$p_hash text DEFAULT NULL::text, p_historica boolean DEFAULT false)$a$);
  v := pg_temp._una(v,
$a$    insert into public.pagos_importaciones (origen, archivo, hash_sha256, created_by)
    values ('arca_recibidos', left(btrim(coalesce(p_archivo, '')), 255), nullif(btrim(coalesce(p_hash, '')), ''), p_user_id)$a$,
$a$    insert into public.pagos_importaciones (origen, archivo, hash_sha256, created_by, historica)
    values ('arca_recibidos', left(btrim(coalesce(p_archivo, '')), 255), nullif(btrim(coalesce(p_hash, '')), ''), p_user_id,
            coalesce(p_historica, false))$a$);
  v := pg_temp._una(v,
$a$          sin_imputar, desglose_a_revisar, tributos_a_revisar, origen_carga, importacion_id, created_by, updated_by)$a$,
$a$          sin_imputar, desglose_a_revisar, tributos_a_revisar, origen_carga, importacion_id, created_by, updated_by,
          pago_a_reconstruir)$a$);
  v := pg_temp._una(v,
$a$          true, v_desg, v_trib_rev, 'arca_recibidos', v_imp_id, p_user_id, p_user_id)$a$,
$a$          true, v_desg, v_trib_rev, 'arca_recibidos', v_imp_id, p_user_id, p_user_id,
          coalesce(p_historica, false))$a$);
  v := pg_temp._una(v,
$a$    'confirmado', p_confirmar,$a$,
$a$    'confirmado', p_confirmar,
    'historica', coalesce(p_historica, false),$a$);
  drop function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text);
  execute v;
end $m$;

-- 3.f) pagos_resumen: + p_pago_a_reconstruir (al final, default null), y
--      «vence en 7/30» no cuenta las marcadas.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$p_concepto_id bigint DEFAULT NULL::bigint)$a$,
$a$p_concepto_id bigint DEFAULT NULL::bigint, p_pago_a_reconstruir boolean DEFAULT NULL::boolean)$a$);
  v := pg_temp._una(v,
$a$       and (p_sin_imputar is null or v.sin_imputar = p_sin_imputar)
$a$,
$a$       and (p_sin_imputar is null or v.sin_imputar = p_sin_imputar)
       and (p_pago_a_reconstruir is null or v.pago_a_reconstruir = p_pago_a_reconstruir)
$a$);
  v := pg_temp._una(v,
$a$                and v.vence_el is not null
$a$,
$a$                and v.vence_el is not null and not v.pago_a_reconstruir
$a$);
  drop function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
drop function pg_temp._vista(text, text);

-- ── 4) Comentarios y grants ────────────────────────────────────────────
comment on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean) is
  'Importa «Mis Comprobantes Recibidos» de ARCA como facturas sin_imputar (vista previa con p_confirmar=false; todo o nada al confirmar). 20260927c. p_historica (20260928b): meses ya pagados, nacen pago_a_reconstruir.';

comment on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean) is
  'Agregados de la bandeja de Compras por grupo. p_sin_imputar y p_concepto_id (20260927k) y p_pago_a_reconstruir (20260928b, flag efectivo de v_pagos_facturas) filtran igual que el listado.';

do $$
declare f text;
begin
  foreach f in array array[
    'fn_pagos_a_reconstruir_guard()',
    'pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean)',
    'pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
