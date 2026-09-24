-- =====================================================================
-- Contabilidad: rubro «resultado» para el plan de Finnegans (2026-09-27)
--
-- Por qué: el contador mandó el plan real (Finnegans). Su cuenta 4
-- «RESULTADO DEL PERIODO» es un título con hijas de INGRESOS (4.1, saldo
-- acreedor) y de GASTOS (4.2, saldo deudor). Hasta hoy la hija tenía que
-- tener el MISMO rubro que la madre (RUBRO_DISTINTO_AL_PADRE, en
-- fn_cont_cuenta_consistente y en cont_importar_plan) y ese plan no entraba.
--
-- 1) cont_cuentas.rubro suma 'resultado', SOLO para títulos
--    (CHECK cont_cuentas_resultado_solo_titulo; código RESULTADO_SOLO_TITULO
--    en el trigger y en el importador).
-- 2) Madre/hija: si la madre es 'resultado', la hija puede ser 'resultado',
--    'ingreso' o 'egreso'. En cualquier otro caso, la regla de siempre.
--    Una hija de 'resultado' sin rubro explícito → RUBRO_REQUERIDO (no se
--    puede heredar). Parches por ancla sobre la definición viva de
--    fn_cont_cuenta_consistente, cont_importar_plan y cont_guardar_cuenta.
--    El importador acepta también «resultados».
-- 3) cont_guardar_cuenta: al cambiar el código, hereda el rubro de la nueva
--    madre (si no vino rubro explícito), salvo que la madre sea 'resultado'.
-- 4) _cont_naturaleza('resultado') ya devuelve NULL (el CASE no lo cubre) y
--    cont_sumas_saldos arma saldo_deudor/saldo_acreedor por el SIGNO de
--    (saldo anterior + debe − haber) en cada fila, sin mirar la naturaleza:
--    una fila de rubro 'resultado' agregada por nivel ya muestra el neto como
--    deudor o acreedor, y los totales suman solo imputables (el cuadre no
--    cambia). cont_mayor devuelve naturaleza null para un título 'resultado'.
--    Los mapeos de fase 3 solo aceptan cuentas imputables: 'resultado' no
--    aparece. Nada que tocar ahí.
-- =====================================================================

-- ── 1) Rubro y CHECK ───────────────────────────────────────────────────
alter table public.cont_cuentas drop constraint cont_cuentas_rubro_check;
alter table public.cont_cuentas
  add constraint cont_cuentas_rubro_check check (rubro in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso', 'resultado')),
  add constraint cont_cuentas_resultado_solo_titulo check (rubro <> 'resultado' or not imputable);

-- ── 2) Parches por ancla ───────────────────────────────────────────────
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

-- 2.a) Trigger de consistencia del plan.
do $m$
declare
  v text := pg_get_functiondef('public.fn_cont_cuenta_consistente()'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  if new.auxiliar <> 'none' and not new.imputable then$a$,
$a$  -- 20260927i: 'resultado' es solo para títulos.
  if new.rubro = 'resultado' and new.imputable then
    raise exception 'RESULTADO_SOLO_TITULO' using errcode = 'P0001', detail = json_build_object('codigo', new.codigo)::text;
  end if;
  if new.auxiliar <> 'none' and not new.imputable then$a$);
  v := pg_temp._una(v,
$a$    if new.rubro is distinct from v_p.rubro then$a$,
$a$    -- 20260927i: bajo un título 'resultado' la hija puede ser resultado, ingreso o egreso.
    if new.rubro is distinct from v_p.rubro
       and not (v_p.rubro = 'resultado' and new.rubro in ('resultado', 'ingreso', 'egreso')) then$a$);
  execute v;
end $m$;

-- 2.b) Importador del plan.
do $m$
declare
  v text := pg_get_functiondef('public.cont_importar_plan(jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$    v_rub := nullif(lower(btrim(coalesce(v_e ->> 'rubro', ''))), '');$a$,
$a$    v_rub := nullif(lower(btrim(coalesce(v_e ->> 'rubro', ''))), '');
    if v_rub = 'resultados' then v_rub := 'resultado'; end if;$a$);
  v := pg_temp._una(v,
$a$    elsif v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso') then$a$,
$a$    elsif v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso', 'resultado') then$a$);
  v := pg_temp._una(v,
$a$          else
            v_rub := v_prub;
          end if;
        elsif v_pcod is not null and v_rub <> v_prub then$a$,
$a$          elsif v_prub = 'resultado' then
            -- Bajo 'resultado' no se hereda: ingreso o egreso hay que decirlo.
            v_err := 'RUBRO_REQUERIDO'; v_det := jsonb_build_object('padre_codigo', v_pcod, 'rubro_padre', v_prub);
          else
            v_rub := v_prub;
          end if;
        elsif v_pcod is not null and v_rub <> v_prub
              and not (v_prub = 'resultado' and v_rub in ('resultado', 'ingreso', 'egreso')) then$a$);
  v := pg_temp._una(v,
$a$      if v_err is null then
        v_aux := coalesce(v_aux, 'none');$a$,
$a$      if v_err is null and v_rub = 'resultado' and v_imp then
        v_err := 'RESULTADO_SOLO_TITULO'; v_det := jsonb_build_object('codigo', v_cod);
      end if;

      if v_err is null then
        v_aux := coalesce(v_aux, 'none');$a$);
  execute v;
end $m$;

-- 2.c) Alta/edición de una cuenta.
do $m$
declare
  v text := pg_get_functiondef('public.cont_guardar_cuenta(jsonb,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_cons  text;$a$,
$a$  v_cons  text;
  v_prub  text;$a$);
  v := pg_temp._una(v,
$a$  if v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso') then$a$,
$a$  if v_rub = 'resultados' then v_rub := 'resultado'; end if;
  if v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso', 'resultado') then$a$);
  v := pg_temp._una(v,
$a$  if v_rub is null then
    if position('.' in v_cod) = 0 then$a$,
$a$  -- 20260927i: al cambiar el código (sin rubro explícito) se hereda el rubro de
  -- la nueva madre, salvo que la madre sea 'resultado' (ahí queda el que tenía).
  if v_id is not null and nullif(btrim(coalesce(p_cuenta ->> 'rubro', '')), '') is null
     and v_cod is distinct from v_old.codigo and position('.' in v_cod) > 0 then
    select rubro into v_prub from public.cont_cuentas where codigo = regexp_replace(v_cod, '\.[0-9]+$', '');
    if v_prub is not null and v_prub <> 'resultado' then v_rub := v_prub; end if;
  end if;
  if v_rub is null then
    if position('.' in v_cod) = 0 then$a$);
  v := pg_temp._una(v,
$a$    select rubro into v_rub from public.cont_cuentas where codigo = v_pcod;
    if v_rub is null then$a$,
$a$    select rubro into v_rub from public.cont_cuentas where codigo = v_pcod;
    if v_rub = 'resultado' then
      raise exception 'RUBRO_REQUERIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'rubro', 'padre_codigo', v_pcod, 'rubro_padre', v_rub)::text;
    end if;
    if v_rub is null then$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
