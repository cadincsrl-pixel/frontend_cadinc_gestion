-- =====================================================================
-- Compras: código del proveedor y concepto en las vistas (2026-09-25)
--
-- Por qué: la bandeja, la ficha, las órdenes, los Excel y la búsqueda `q`
-- tienen que mostrar/encontrar el código del proveedor (20260925i) y el
-- concepto de la factura (20260925j). Todo sale de las vistas.
--
-- Columnas nuevas, SIEMPRE AL FINAL (`create or replace view` no deja
-- insertar en el medio):
--   · v_pagos_facturas: proveedor_codigo, concepto_id, concepto (nombre).
--   · v_pagos_ordenes: proveedor_codigo.
--   · v_pagos_proveedores: codigo.
--   · v_pagos_proveedor_saldo: proveedor_codigo.
-- `busq` suma el código (y su forma sin guion, «prv0001») en facturas,
-- órdenes y proveedores, y el nombre del concepto en facturas.
-- El concepto se lee con una subconsulta escalar por PK en vez de un JOIN:
-- el FROM de v_pagos_facturas es un árbol de 12 joins entre paréntesis y
-- tocarlo por reemplazo es frágil.
--
-- pagos_resumen: grupo nuevo `'concepto'` (grupo = concepto_id::text,
-- grupo_nom = nombre; las que no tienen concepto caen en 'sin_concepto' /
-- 'Sin concepto'). Los grupos que ya existían no cambian. Misma firma.
--
-- Técnica (como 20260925k): definición VIVA (pg_get_viewdef /
-- pg_get_functiondef) + reemplazos contados; si un ancla no aparece
-- exactamente una vez, la migración falla entera. v_pagos_proveedor_saldo
-- conserva `security_invoker = true` (create or replace view pisa las
-- opciones si no se repiten); las otras tres no tienen opciones hoy y
-- quedan igual.
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

-- ── 1) v_pagos_facturas ────────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_facturas'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$|| f.obs)) AS busq,$a$,
$a$|| f.obs) || ' '::text || COALESCE(p.codigo, ''::text) || ' '::text || replace(COALESCE(p.codigo, ''::text), '-'::text, ''::text)
      || ' '::text || COALESCE(( SELECT c.nombre FROM pagos_conceptos c WHERE c.id = f.concepto_id), ''::text)) AS busq,$a$);
  v := pg_temp._una(v,
$a$END AS nc_txt
   FROM $a$,
$a$END AS nc_txt,
    p.codigo AS proveedor_codigo,
    f.concepto_id,
    ( SELECT c.nombre FROM pagos_conceptos c WHERE c.id = f.concepto_id) AS concepto
   FROM $a$);
  execute 'create or replace view public.v_pagos_facturas as ' || v;
end $m$;

-- ── 2) v_pagos_ordenes ─────────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_ordenes'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$|| o.obs)) AS busq,$a$,
$a$|| o.obs) || ' '::text || COALESCE(p.codigo, ''::text) || ' '::text || replace(COALESCE(p.codigo, ''::text), '-'::text, ''::text)) AS busq,$a$);
  v := pg_temp._una(v,
$a$pr.nombre AS registrada_por_nombre
   FROM $a$,
$a$pr.nombre AS registrada_por_nombre,
    p.codigo AS proveedor_codigo
   FROM $a$);
  execute 'create or replace view public.v_pagos_ordenes as ' || v;
end $m$;

-- ── 3) v_pagos_proveedores ─────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_proveedores'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$|| p.contacto)) AS busq,$a$,
$a$|| p.contacto) || ' '::text || p.codigo || ' '::text || replace(p.codigo, '-'::text, ''::text)) AS busq,$a$);
  v := pg_temp._una(v,
$a$AS saldo_neto
   FROM $a$,
$a$AS saldo_neto,
    p.codigo
   FROM $a$);
  execute 'create or replace view public.v_pagos_proveedores as ' || v;
end $m$;

-- ── 4) v_pagos_proveedor_saldo (security_invoker) ──────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_proveedor_saldo'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$AS nc_disponible
   FROM $a$,
$a$AS nc_disponible,
    p.codigo AS proveedor_codigo
   FROM $a$);
  execute 'create or replace view public.v_pagos_proveedor_saldo with (security_invoker = true) as ' || v;
end $m$;

-- ── 5) pagos_resumen: grupo 'concepto' ─────────────────────────────────
do $m$
declare
  v text := pg_get_functiondef('public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$             when 'forma_pago'   then f.forma_pago_prevista
$a$,
$a$             when 'forma_pago'   then f.forma_pago_prevista
             when 'concepto'     then coalesce(f.concepto_id::text, 'sin_concepto')
$a$);
  v := pg_temp._una(v,
$a$             when 'estado'       then case when f.paga_cliente then 'Pagó el cliente' else f.estado end
             else null end as grupo_nom,$a$,
$a$             when 'estado'       then case when f.paga_cliente then 'Pagó el cliente' else f.estado end
             when 'concepto'     then coalesce(f.concepto, 'Sin concepto')
             else null end as grupo_nom,$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
