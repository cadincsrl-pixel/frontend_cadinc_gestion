-- =====================================================================
-- Compras: de qué cuenta propia salió la plata de la OP (2026-09-26)
--
-- Por qué: para contabilizar un pago (fase 3) y conciliar bancos (fase 4)
-- hace falta saber de qué cuenta de CADINC salió. Se registra contra
-- tesoreria_cuentas (20260926b), no contra ventas_cuentas_bancarias: Pagos
-- no lee tablas de Ventas (§5.18).
--
-- 1) pagos_ordenes.cuenta_origen_id, OPCIONAL (NULL = sin indicar: todas las
--    OP anteriores). NO se suma a fn_pagos_orden_congelada: se corrige por
--    PATCH mientras no exista el contabilizador.
-- 2) _pagos_emitir_orden: lee p_orden->>'cuenta_origen_id', valida que la
--    cuenta exista y esté activa (CUENTA_ORIGEN_INVALIDA) y la guarda. Si la
--    clave no viene, hace exactamente lo mismo que antes. Técnica de
--    20260925p: definición VIVA + reemplazo contado (si un ancla no aparece
--    exactamente una vez, falla todo). Misma firma, mismos grants.
--    pagos_registrar_orden y pagos_crear_factura (factura cargada ya pagada)
--    le pasan p_orden tal cual: las dos rutas lo aceptan sin más cambios.
-- 3) v_pagos_ordenes: suma cuenta_origen_id y cuenta_origen_nombre AL FINAL
--    (técnica de 20260925q).
-- =====================================================================

alter table public.pagos_ordenes
  add column cuenta_origen_id bigint references public.tesoreria_cuentas(id);
comment on column public.pagos_ordenes.cuenta_origen_id is
  'De qué cuenta propia salió la plata. Opcional; NULL = sin indicar (todas las OP anteriores)';
create index pagos_ordenes_cuenta_origen_idx on public.pagos_ordenes (cuenta_origen_id) where cuenta_origen_id is not null;

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

-- ── 2) _pagos_emitir_orden ─────────────────────────────────────────────
do $m$
declare
  v text := pg_get_functiondef('public._pagos_emitir_orden(bigint,jsonb,jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_constraint  text;$a$,
$a$  v_constraint  text;
  v_cta_origen  bigint;$a$);

  v := pg_temp._una(v,
$a$  perform pg_advisory_xact_lock(hashtext('pagos_ordenes_numero'));$a$,
$a$  v_cta_origen := nullif(p_orden ->> 'cuenta_origen_id', '')::bigint;
  if v_cta_origen is not null and not exists (select 1 from public.tesoreria_cuentas t where t.id = v_cta_origen and t.activo) then
    raise exception 'CUENTA_ORIGEN_INVALIDA' using errcode = 'P0001', detail = json_build_object('cuenta_origen_id', v_cta_origen)::text;
  end if;
  perform pg_advisory_xact_lock(hashtext('pagos_ordenes_numero'));$a$);

  v := pg_temp._una(v,
$a$monto_pagado, monto_nc, obs, created_by, updated_by)$a$,
$a$monto_pagado, monto_nc, obs, created_by, updated_by, cuenta_origen_id)$a$);

  v := pg_temp._una(v,
$a$v_pagado, 0, coalesce(p_orden ->> 'obs', ''), p_user_id, p_user_id)$a$,
$a$v_pagado, 0, coalesce(p_orden ->> 'obs', ''), p_user_id, p_user_id, v_cta_origen)$a$);

  execute v;
end $m$;

-- ── 3) v_pagos_ordenes ─────────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_ordenes'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$AS tiene_recibo$a$,
$a$AS tiene_recibo,
    o.cuenta_origen_id,
    ( SELECT t.nombre FROM tesoreria_cuentas t WHERE t.id = o.cuenta_origen_id) AS cuenta_origen_nombre$a$);
  execute 'create or replace view public.v_pagos_ordenes as ' || v;
end $m$;

drop function pg_temp._una(text, text, text);
