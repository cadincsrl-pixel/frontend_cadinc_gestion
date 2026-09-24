-- =====================================================================
-- Contabilidad: las subclaves que ofrece el mapeo se pueden guardar
-- (2026-09-27)
--
-- Por qué (revisión de código de la fase 3): cont_mapeos_listar ofrece, para
-- `ventas.externo`, cualquier cbte_tipo presente en
-- ventas_comprobantes_externos, pero _cont_subclave_valida solo aceptaba
-- 1, 2, 3, 6, 7, 8, 60, 61, 201, 202, 203: si los datos traían otro código,
-- la pantalla lo mostraba y guardarlo daba SUBCLAVE_INVALIDA.
--
-- Hoy el CHECK de ventas_comprobantes_externos.cbte_tipo es justamente esa
-- lista, así que el choque no se puede dar todavía; se cierra igual para que
-- no aparezca el día que se amplíe ese CHECK:
-- 1) _cont_subclave_valida acepta todos los comprobantes de venta de ARCA
--    que el motor puede llegar a encontrar: A (1, 2, 3), B (6, 7, 8),
--    C (11, 12, 13), CVLP (60, 61) y FCE A/B/C (201–203, 206–208, 211–213).
-- 2) cont_mapeos_listar filtra lo que sale de los DATOS con la misma
--    validación (las fijas y las ya mapeadas se muestran siempre): el listado
--    nunca ofrece algo que no se pueda guardar, para ninguna clave.
-- 3) _cont_subclave_etiqueta nombra los códigos con _pagos_nombre_cbte.
-- OJO (no se toca acá): el motor (20260927e) toma como nota de crédito solo
-- 3, 8 y 203. Si se amplía el CHECK de externos a 13/208/213, sumarlos ahí.
-- Parche por anclas sobre la definición viva (20260927d).
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

do $m$
declare
  v text;
begin
  -- 1) Validación.
  v := pg_get_functiondef('public._cont_subclave_valida(text, text)'::regprocedure);
  v := pg_temp._una(v,
$a$p_sub::int in (1, 2, 3, 6, 7, 8, 60, 61, 201, 202, 203));$a$,
$a$p_sub::int in (1, 2, 3, 6, 7, 8, 11, 12, 13, 60, 61,
                                                              201, 202, 203, 206, 207, 208, 211, 212, 213));$a$);
  execute v;

  -- 2) Listado: lo que sale de los datos, filtrado por la misma validación.
  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
$a$    ) q;
$a$,
$a$    ) q
    where public._cont_subclave_valida(r ->> 'clave', q.s)
       or (r -> 'subclaves') ? q.s
       or exists (select 1 from public.cont_mapeos m where m.clave = r ->> 'clave' and m.subclave = q.s);
$a$);
  execute v;

  -- 3) Etiquetas.
  v := pg_get_functiondef('public._cont_subclave_etiqueta(text, text)'::regprocedure);
  v := pg_temp._una(v,
$a$when '60' then 'CVLP A (60)' when '61' then 'CVLP B (61)'
                 else 'Comprobante ' || p_sub end$a$,
$a$when '60' then 'CVLP A (60)' when '61' then 'CVLP B (61)'
                 else case when p_sub ~ '^[0-9]{1,3}$' then public._pagos_nombre_cbte(p_sub::smallint) || ' (' || p_sub || ')'
                           else 'Comprobante ' || p_sub end end$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
