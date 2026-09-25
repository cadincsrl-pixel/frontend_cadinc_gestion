-- =====================================================================
-- 20260929o — Compras › Facturas: chips = lista, y «p/ aprobar» sin las
-- importadas sin imputar (2026-09-25)
--
-- 1) `pagos_resumen` suma `p_ids bigint[]` (al FINAL, default null). Con
--    p_ids el conjunto de facturas lo decide el backend con el MISMO
--    `aplicarFiltrosFacturas` que arma la lista (una sola fuente de verdad,
--    CLAUDE.md §5.9): el backend junta los ids de a 1000 (cap de PostgREST,
--    §5.7) y la RPC solo agrega. Hasta hoy la RPC recibía un subconjunto de
--    filtros y los chips ignoraban «Sin adjunto», «Sin número», período IVA,
--    importación, etc. (tildar «Sin adjunto» → lista 0, chips 8/1/19).
--    Los parámetros viejos quedan (neutros si vienen null) para no romper a
--    nadie; el backend manda p_archivadas=true para que la RPC no vuelva a
--    filtrar lo que ya filtró la lista.
--    Cambia la firma: se toma la definición VIVA, se parchea por ancla, se
--    borra la firma vieja y se crea la nueva con los mismos grants
--    (solo service_role).
--
-- 2) `v_pagos_proveedor_saldo.para_aprobar` deja afuera las `sin_imputar`
--    (importadas de ARCA sin concepto ni reparto: no se pueden aprobar hasta
--    imputarlas y la bandeja por defecto las esconde). Columna nueva AL
--    FINAL `para_imputar` = pendientes sin imputar. El saldo y la deuda NO
--    cambian: esas facturas se deben igual.
--    Esperado: VOLTAJE 3 + 4, Silva 1 + 3, GIMENEZ 1 + 1.
-- =====================================================================

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

-- ── 1) pagos_resumen(…, p_ids) ──────────────────────────────────────────
do $m$
declare
  v text := pg_get_functiondef('public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$p_pago_a_reconstruir boolean DEFAULT NULL::boolean)
 RETURNS TABLE$a$,
$a$p_pago_a_reconstruir boolean DEFAULT NULL::boolean, p_ids bigint[] DEFAULT NULL::bigint[])
 RETURNS TABLE$a$);
  v := pg_temp._una(v,
$a$     where (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
$a$,
$a$     where (p_ids is null or v.id = any(p_ids))
       and (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
$a$);
  drop function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean);
  execute v;
end $m$;

revoke all on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean,bigint[]) from public, anon, authenticated;
grant execute on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean,bigint[]) to service_role;

comment on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint,boolean,bigint[]) is
  'Agregados de la bandeja de Compras por grupo. Desde 20260929o el backend manda p_ids = las facturas que devuelve aplicarFiltrosFacturas (la misma consulta que la lista), así los chips no pueden contar otra cosa; los demás filtros quedan por compatibilidad.';

-- ── 2) v_pagos_proveedor_saldo: para_aprobar sin las sin imputar + para_imputar ──
do $m$
declare
  v text := pg_get_viewdef('public.v_pagos_proveedor_saldo'::regclass, true);
begin
  v := pg_temp._una(v,
$a$count(*) FILTER (WHERE v.estado = 'pendiente'::text) AS para_aprobar,$a$,
$a$count(*) FILTER (WHERE v.estado = 'pendiente'::text AND NOT v.sin_imputar) AS para_aprobar,
            count(*) FILTER (WHERE v.estado = 'pendiente'::text AND v.sin_imputar) AS para_imputar,$a$);
  v := pg_temp._una(v,
$a$ AS facturas_a_reconstruir
   FROM$a$,
$a$ AS facturas_a_reconstruir,
    COALESCE(s.para_imputar, 0::bigint)::integer AS para_imputar
   FROM$a$);
  execute 'create or replace view public.v_pagos_proveedor_saldo with (security_invoker = true) as ' || v;
end $m$;

comment on column public.v_pagos_proveedor_saldo.para_aprobar is
  'Pendientes que se pueden aprobar ya: sin las sin_imputar (20260929o).';
comment on column public.v_pagos_proveedor_saldo.para_imputar is
  'Pendientes importadas de ARCA sin concepto ni reparto: hay que imputarlas antes de aprobar (20260929o). Cuentan en el saldo.';
