-- =====================================================================
-- 20261001d — Cartera: vuelve el vínculo del cheque de un cobro de Ventas
-- con el que ya estaba en la cartera (2026-09-25)
--
-- 20260930k parcheó fn_cheques_recibidos_desde_ventas para que, si el cheque
-- ya estaba en la cartera (lo cargó Logística), se VINCULE al medio de Ventas
-- en vez de ignorarse, y para llevar el CUIT del librador. 20260930m (otra
-- sesión, aplicada después) recreó la función desde su versión de 20260930f
-- con `create or replace` y ese parche se perdió: al cargar la liquidación
-- 3179 de Casilda los 6 cheques quedaban sin vincular.
-- Se reaplican los mismos anclajes sobre la función viva (conserva la llamada
-- a _cartera_vincular_endosos de 20260930m) y se vinculan los medios vigentes
-- que hayan quedado sueltos en el medio.
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

do $p$
declare v text := pg_get_functiondef('public.fn_cheques_recibidos_desde_ventas()'::regprocedure);
begin
  if position('librador_cuit' in v) > 0 then
    raise notice 'fn_cheques_recibidos_desde_ventas ya tiene el parche';
    return;
  end if;
  v := pg_temp._una(v,
$a$    delete from public.cheques_recibidos where ventas_cobro_medio_id = new.id and estado = 'en_cartera';$a$,
$n$    delete from public.cheques_recibidos where ventas_cobro_medio_id = new.id and estado = 'en_cartera' and origen = 'ventas_cobro';
    update public.cheques_recibidos set ventas_cobro_medio_id = null, updated_at = now(), updated_by = public.usuario_actual()
     where ventas_cobro_medio_id = new.id and origen <> 'ventas_cobro';$n$);
  v := pg_temp._una(v,
$a$insert into public.cheques_recibidos (numero, banco, librador, fecha_cobro,$a$,
$n$insert into public.cheques_recibidos (numero, banco, librador, librador_cuit, fecha_cobro,$n$);
  v := pg_temp._una(v,
$a$nullif(btrim(new.cheque_librador), ''),
            new.cheque_fecha_cobro,$a$,
$n$nullif(btrim(new.cheque_librador), ''),
            new.cheque_librador_cuit, new.cheque_fecha_cobro,$n$);
  v := pg_temp._una(v,
$a$librador = excluded.librador,$a$,
$n$librador = excluded.librador, librador_cuit = excluded.librador_cuit,$n$);
  v := pg_temp._una(v,
$a$  exception when unique_violation then
    null;$a$,
$n$  exception when unique_violation then
    -- El mismo cheque ya está en la cartera (p. ej. vino de Logística): no se
    -- duplica, se vincula a este medio y se completa lo que le faltaba (20260930k/20261001d).
    update public.cheques_recibidos r
       set ventas_cobro_medio_id = new.id,
           librador      = coalesce(r.librador, nullif(btrim(new.cheque_librador), '')),
           librador_cuit = coalesce(r.librador_cuit, new.cheque_librador_cuit),
           banco         = coalesce(r.banco, nullif(btrim(new.cheque_banco), '')),
           fecha_cobro   = coalesce(r.fecha_cobro, new.cheque_fecha_cobro),
           es_echeq      = coalesce(r.es_echeq, new.forma = 'echeq'),
           updated_at = now(), updated_by = public.usuario_actual()
     where r.numero_norm = coalesce(nullif(ltrim(regexp_replace(new.cheque_numero, '\D', '', 'g'), '0'), ''), '0')
       and r.importe = round(new.importe, 2)
       and r.ventas_cobro_medio_id is null;$n$);
  execute v;
end $p$;

-- Medios de cobros vigentes que quedaron sin su cheque en la cartera.
update public.cheques_recibidos r
   set ventas_cobro_medio_id = m.id,
       librador_cuit = coalesce(r.librador_cuit, m.cheque_librador_cuit),
       updated_at = now()
  from public.ventas_cobro_medios m
  join public.ventas_cobros c on c.id = m.cobro_id and c.estado = 'vigente'
 where m.forma in ('cheque', 'echeq')
   and r.ventas_cobro_medio_id is null
   and r.numero_norm = coalesce(nullif(ltrim(regexp_replace(m.cheque_numero, '\D', '', 'g'), '0'), ''), '0')
   and r.importe = round(m.importe, 2)
   and not exists (select 1 from public.cheques_recibidos x where x.ventas_cobro_medio_id = m.id);
