-- =====================================================================
-- 20260930l — Contabilidad: los gastos descontados en un cobro (2026-09-25)
--
-- Va con 20260930k (ventas_cobro_gastos). Cada gasto que el cliente descontó
-- al pagar (Recupero Ley 25413, seguro de carga…) va al DEBE de la cuenta
-- que el contador mapee en la clave nueva `cobros.gasto` (subclave = id del
-- concepto de Ventas › Configuración › Gastos descontados). Deudores se
-- acredita por el total del cobro, que ya los incluye.
-- Sin mapeo el cobro queda pendiente con SIN_MAPEO: nunca se inventa cuenta.
--
-- Parches por ancla (mismo molde que cobros.retencion en 20260929g):
-- `_cont_mapeo_reglas`, `_cont_subclave_valida`, `cont_mapeos_listar`,
-- `_cont_subclave_etiqueta`, `_cont_mapeo_en_uso` y `_cont_prop_cobro`.
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

-- La clave nueva en el CHECK de cont_mapeos (por ancla sobre la definición viva).
do $c$
declare v text := pg_get_constraintdef((select oid from pg_constraint
                                         where conrelid = 'public.cont_mapeos'::regclass and conname = 'cont_mapeos_clave_check'));
begin
  v := pg_temp._una(v, $a$'cobros.retencion'::text,$a$, $n$'cobros.retencion'::text, 'cobros.gasto'::text,$n$);
  execute 'alter table public.cont_mapeos drop constraint cont_mapeos_clave_check';
  execute 'alter table public.cont_mapeos add constraint cont_mapeos_clave_check ' || v;
end $c$;

do $p$
declare v text;
begin
  -- La regla, después de las retenciones.
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v,
$a$    {"clave":"pagos.puente",$a$,
$n$    {"clave":"cobros.gasto","etiqueta":"Gastos descontados en cobros","descripcion":"Cuenta de cada concepto que el cliente descuenta al pagar (impuesto al cheque, seguro de carga, pago de playa…). Va al debe; los conceptos se editan en Ventas › Configuración.","rubros":["egreso","activo"],"auxiliares":["none"],"subclave_tipo":"concepto_gasto_cobro","subclaves":[],"lookup":"exacto"},
    {"clave":"pagos.puente",$n$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'concepto_fondos' then$a$,
$n$    when 'concepto_gasto_cobro' then
      return p_sub ~ '^[0-9]{1,18}$' and exists (select 1 from public.ventas_cobro_gasto_conceptos k where k.id = p_sub::bigint);
    when 'concepto_fondos' then$n$);
  execute v;

  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
$a$      union select x.clave from public.ventas_retencion_tipos x where r ->> 'clave' = 'cobros.retencion'$a$,
$n$      union select x.clave from public.ventas_retencion_tipos x where r ->> 'clave' = 'cobros.retencion'
      union select k.id::text from public.ventas_cobro_gasto_conceptos k where r ->> 'clave' = 'cobros.gasto'$n$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when p_clave = 'fondos.concepto' then$a$,
$n$    when p_clave = 'cobros.gasto' then
      coalesce((select k.nombre || case when k.activo then '' else ' (baja)' end
                  from public.ventas_cobro_gasto_conceptos k where p_sub ~ '^[0-9]{1,18}$' and k.id = p_sub::bigint), 'Concepto ' || p_sub)
    when p_clave = 'fondos.concepto' then$n$);
  execute v;

  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'pagos.puente' then$a$,
$n$    when 'cobros.gasto' then
      if p_sub ~ '^[0-9]{1,18}$' then
        select count(distinct g.cobro_id) into v_n from public.ventas_cobro_gastos g
          join public.ventas_cobros c on c.id = g.cobro_id
         where c.ambiente = 'prod' and c.estado = 'vigente' and c.fecha >= p_desde and g.concepto_id = p_sub::bigint;
      end if;
    when 'pagos.puente' then$n$);
  execute v;

  -- El asiento del cobro: cada gasto al debe.
  v := pg_get_functiondef('public._cont_prop_cobro(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$  p := public._cont_prop_linea(p, 'ventas.deudores', array[''], false, c.total,$a$,
$n$  for r in select g.*, k.nombre as concepto_nombre
             from public.ventas_cobro_gastos g join public.ventas_cobro_gasto_conceptos k on k.id = g.concepto_id
            where g.cobro_id = p_id order by g.orden, g.id loop
    p := public._cont_prop_linea(p, 'cobros.gasto', array[r.concepto_id::text], true, r.importe, null, null, null,
                                 g || ' — ' || r.concepto_nombre);
  end loop;

  p := public._cont_prop_linea(p, 'ventas.deudores', array[''], false, c.total,$n$);
  execute v;
end $p$;

notify pgrst, 'reload schema';
