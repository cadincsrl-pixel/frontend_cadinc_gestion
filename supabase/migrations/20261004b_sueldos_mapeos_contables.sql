-- =====================================================================
-- 20261004b — Sueldos: claves de mapeo contable `sueldos.*` (2026-09-26)
--
-- Por qué: al cerrar una liquidación (20261004d) se arma el asiento de
-- sueldos con las cuentas de cont_mapeos, igual que el motor automático:
-- nunca se inventa una cuenta; sin mapeo el asiento no se genera y la
-- liquidación queda con el aviso SIN_MAPEO.
--
-- Claves nuevas (subclave = código del convenio, o '' = General; el lookup
-- es convenio → general):
--   Debe  sueldos.remunerativo      egreso   haberes remunerativos (por obra)
--         sueldos.no_remunerativo   egreso   no remunerativos (por obra)
--         sueldos.contribuciones    egreso   contribuciones patronales (por obra)
--         sueldos.fondo_cese        egreso   fondo de cese laboral UOCRA (por obra)
--   Haber sueldos.a_pagar           pasivo   neto a pagar
--         sueldos.aportes_a_pagar   pasivo   aportes y contribuciones destino f931
--         sueldos.sindicato_a_pagar pasivo   cuota/aporte solidario/seguro/OSCHOCA (destino sindicato)
--         sueldos.fondo_cese_a_pagar pasivo  fondo de cese a depositar
--         sueldos.otros_a_pagar     pasivo   descuentos/contribuciones destino otros
--                                            (clave agregada a la spec: embargos, IERIC…)
--         sueldos.prestamos         activo   cancela el préstamo/anticipo del empleado
--
-- Parches por ancla (patrón de 20261001b), solo agregan: el CHECK
-- cont_mapeos_clave_check, _cont_mapeo_reglas, _cont_subclave_etiqueta y
-- _cont_mapeo_en_uso. _cont_subclave_valida y cont_mapeos_listar ya cubren
-- claves `fija`.
--
-- Mapeo inicial SOLO donde la cuenta del plan (Finnegans) es inequívoca:
--   remunerativo / no_remunerativo: uocra 4.2.1.02.01 «Sueldos y Jornales
--     Construcción», uecara 4.2.1.03.01 «… Administración», camioneros
--     4.2.1.04.01 «… Comercialización» (en ese grupo ya están «Sindicato de
--     choferes nacional/tucumán»: es donde el plan pone el personal de camiones).
--   contribuciones: 4.2.1.02.02 / 4.2.1.03.02 / 4.2.1.04.02 «Cargas sociales …».
--   fondo_cese|uocra: 4.2.1.02.02 «Cargas sociales Construcción».
--   a_pagar: 2.1.2.01 «Sueldos y Jornales a pagar».
--   aportes_a_pagar: 2.1.2.02.02 «F.931 a pagar».
--   prestamos: 1.1.4.02.05 «Anticipos de Sueldos».
-- Quedan SIN mapeo (no hay cuenta clara): sindicato_a_pagar,
-- fondo_cese_a_pagar, otros_a_pagar. El contador los carga en Contabilidad ›
-- Mapeos; hasta entonces las liquidaciones con esos importes cierran con
-- SIN_MAPEO y se contabilizan después con sueldos_contabilizar_liquidacion.
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

-- ── 1. CHECK de claves ───────────────────────────────────────────────
do $c$
declare v text := pg_get_constraintdef((select oid from pg_constraint
                                         where conrelid = 'public.cont_mapeos'::regclass and conname = 'cont_mapeos_clave_check'));
begin
  v := pg_temp._una(v, $a$'bienes.gasto'::text]$a$,
    $n$'bienes.gasto'::text, 'sueldos.remunerativo'::text, 'sueldos.no_remunerativo'::text, 'sueldos.contribuciones'::text, 'sueldos.fondo_cese'::text, 'sueldos.a_pagar'::text, 'sueldos.aportes_a_pagar'::text, 'sueldos.sindicato_a_pagar'::text, 'sueldos.fondo_cese_a_pagar'::text, 'sueldos.otros_a_pagar'::text, 'sueldos.prestamos'::text]$n$);
  execute 'alter table public.cont_mapeos drop constraint cont_mapeos_clave_check';
  execute 'alter table public.cont_mapeos add constraint cont_mapeos_clave_check ' || v;
end $c$;

-- ── 2. Reglas, etiquetas y «en uso» ─────────────────────────────────
do $p$
declare v text;
begin
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v, $a${"clave":"general.redondeo"$a$,
$n${"clave":"sueldos.remunerativo","etiqueta":"Sueldos: haberes remunerativos","descripcion":"Gasto de los conceptos remunerativos de las liquidaciones de sueldos (básico, horas extras, adicionales, SAC, vacaciones). Por convenio o General. Se imputa a la obra habitual del legajo.","rubros":["egreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.no_remunerativo","etiqueta":"Sueldos: conceptos no remunerativos","descripcion":"Gasto de los conceptos no remunerativos (sumas de acuerdos, viáticos, indemnizaciones). Por convenio o General.","rubros":["egreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.contribuciones","etiqueta":"Sueldos: contribuciones patronales","descripcion":"Gasto de las contribuciones patronales (seguridad social, obra social, ART, seguro de vida, sindicales). No incluye el fondo de cese. Por convenio o General.","rubros":["egreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.fondo_cese","etiqueta":"Sueldos: fondo de cese laboral","descripcion":"Gasto del fondo de cese laboral de la construcción (Ley 22.250, 12 % / 8 %). Por convenio o General.","rubros":["egreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.a_pagar","etiqueta":"Sueldos a pagar (neto)","descripcion":"Pasivo por el neto de los recibos. Lo cancela el pago de sueldos en Tesorería.","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.aportes_a_pagar","etiqueta":"Sueldos: aportes y contribuciones a pagar (F.931)","descripcion":"Pasivo por los aportes retenidos y las contribuciones que se pagan con el F.931 (conceptos con destino f931).","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.sindicato_a_pagar","etiqueta":"Sueldos: sindicato a pagar","descripcion":"Pasivo por cuota sindical, aporte solidario, seguro de vida, sepelio y contribuciones sindicales (OSCHOCA…): conceptos con destino sindicato.","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.fondo_cese_a_pagar","etiqueta":"Sueldos: fondo de cese a depositar","descripcion":"Pasivo por el fondo de cese laboral a depositar en la cuenta de cada trabajador.","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.otros_a_pagar","etiqueta":"Sueldos: otras retenciones y contribuciones a pagar","descripcion":"Pasivo por descuentos y contribuciones con destino «otros» (embargos, IERIC, FAL…).","rubros":["pasivo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"sueldos.prestamos","etiqueta":"Sueldos: préstamos y anticipos descontados","descripcion":"Crédito con el empleado que cancela el descuento de préstamos/anticipos en el recibo.","rubros":["activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["","uocra","uecara","camioneros"],"lookup":"convenio → general"},
    {"clave":"general.redondeo"$n$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v := pg_temp._una(v, $a$when p_sub = '' then 'General'$a$,
$n$when p_clave like 'sueldos.%' then
      case p_sub when '' then 'General (todos los convenios)'
                 else coalesce((select c.nombre from public.sueldos_convenios c where c.codigo = p_sub), p_sub) end
    when p_sub = '' then 'General'$n$);
  execute v;

  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v, $a$when 'iva.ddjj' then$a$,
$n$when 'sueldos.remunerativo', 'sueldos.no_remunerativo', 'sueldos.contribuciones', 'sueldos.fondo_cese',
         'sueldos.a_pagar', 'sueldos.aportes_a_pagar', 'sueldos.sindicato_a_pagar', 'sueldos.fondo_cese_a_pagar',
         'sueldos.otros_a_pagar', 'sueldos.prestamos' then
      select count(*) into v_n from public.sueldos_liquidaciones l
        join public.sueldos_convenios c on c.id = l.convenio_id
       where l.estado = 'cerrada' and l.periodo >= date_trunc('month', p_desde)::date
         and (p_sub = '' or c.codigo = p_sub);
    when 'iva.ddjj' then$n$);
  execute v;
end $p$;

-- ── 3. Mapeo inicial (solo cuentas inequívocas) ──────────────────────
insert into public.cont_mapeos (clave, subclave, cuenta_id, obs)
select m.clave, m.subclave, c.id, 'Mapeo inicial del módulo Sueldos (20261004b): revisar con el contador.'
  from (values
    ('sueldos.remunerativo',    'uocra',      '4.2.1.02.01'),
    ('sueldos.remunerativo',    'uecara',     '4.2.1.03.01'),
    ('sueldos.remunerativo',    'camioneros', '4.2.1.04.01'),
    ('sueldos.no_remunerativo', 'uocra',      '4.2.1.02.01'),
    ('sueldos.no_remunerativo', 'uecara',     '4.2.1.03.01'),
    ('sueldos.no_remunerativo', 'camioneros', '4.2.1.04.01'),
    ('sueldos.contribuciones',  'uocra',      '4.2.1.02.02'),
    ('sueldos.contribuciones',  'uecara',     '4.2.1.03.02'),
    ('sueldos.contribuciones',  'camioneros', '4.2.1.04.02'),
    ('sueldos.fondo_cese',      'uocra',      '4.2.1.02.02'),
    ('sueldos.a_pagar',         '',           '2.1.2.01'),
    ('sueldos.aportes_a_pagar', '',           '2.1.2.02.02'),
    ('sueldos.prestamos',       '',           '1.1.4.02.05')
  ) as m(clave, subclave, codigo)
  join public.cont_cuentas c on c.codigo = m.codigo and c.activo and c.imputable and c.auxiliar = 'none'
 where (public._cont_mapeo_regla(m.clave) -> 'rubros') ? c.rubro
on conflict (clave, subclave) do nothing;
