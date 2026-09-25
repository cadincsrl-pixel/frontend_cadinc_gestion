-- =====================================================================
-- 20261001b — Contabilidad: ITC computable (pago a cuenta de IVA), cuentas de
-- combustibles, IIBB por provincia (2026-09-25)
--
-- Va con 20261001a (tipos icl/idc y pagos_proveedores.icl_computa_pago_a_cuenta).
--
-- 1. Clave nueva `compras.itc_computable` (fija, subclave ''): en el asiento
--    de una compra de un proveedor con el flag, el 45 % de cada tributo `icl`
--    (round 2) va al DEBE de esa cuenta; el 55 % restante y todo el `idc`
--    siguen por `compras.tributo` (icl / idc). El haber a Proveedores no
--    cambia: el asiento sigue cuadrado. Sin mapeo → SIN_MAPEO, como siempre.
--    `compras.tributo` suma las subclaves icl e idc.
--    Parches por ancla: cont_mapeos_clave_check, _cont_mapeo_reglas,
--    _cont_subclave_etiqueta, _cont_mapeo_en_uso y _cont_prop_compra
--    (`_cont_subclave_valida` y `cont_mapeos_listar` ya cubren una clave fija).
-- 2. Asiento mensual de IVA (`_cont_iva_calculo`): el saldo de la cuenta ITC
--    computable (desde el inicio del ejercicio hasta fin del mes, sin el
--    propio asiento de IVA del mes) se usa como pago a cuenta DESPUÉS del
--    saldo técnico arrastrado y ANTES de percepciones/retenciones, y solo
--    hasta el impuesto que queda: nunca genera saldo a favor. Lo que no se
--    usa queda en la cuenta y se traslada solo (es un saldo de activo). Así
--    las percepciones que sobran siguen yendo a libre disponibilidad.
--    Nuevos datos del cálculo: itc_mes, itc_disponible, itc_computado,
--    itc_remanente, y la cuenta con rol 'itc' en `cuentas`.
--    `_cont_iva_diferencias` compara itc_mes con `pago_a_cuenta_itc` de los
--    libros (solo si la foto fiscal lo trae).
-- 3. Plan y mapeos (contador 25/09), por las puertas únicas:
--    · compras.itc_computable → 1.1.4.01.12 «ITC COMPUTABLE».
--    · compras.tributo|icl → 4.2.1.07.16 «Itc no computable» y |idc →
--      4.2.1.07.15 «IDC». El pedido era crear 4.2.1.07.15 «Impuesto a los
--      combustibles», pero ese código ya existe en el plan importado de
--      Finnegans como «IDC», con su hermana .16 «Itc no computable»: se usan
--      esas dos (se re-mapea desde la pantalla si el contador prefiere una sola).
--    · IIBB por provincia: cuenta nueva 1.1.4.01.19 «Saldo a favor IIBB
--      Tucumán» y compras.tributo|percepcion_iibb|<jurisdiccion_id> para
--      Buenos Aires (2), Córdoba (4), Entre Ríos (8), La Pampa (11),
--      Mendoza (13) y Tucumán (24). El motor ya resuelve tipo|id → tipo|texto
--      → tipo (_cont_prop_compra); 1.1.4.01.04 queda de respaldo.
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

-- ── 1. La clave nueva ───────────────────────────────────────────────────
do $c$
declare v text := pg_get_constraintdef((select oid from pg_constraint
                                         where conrelid = 'public.cont_mapeos'::regclass and conname = 'cont_mapeos_clave_check'));
begin
  v := pg_temp._una(v, $a$'compras.tributo'::text,$a$, $n$'compras.tributo'::text, 'compras.itc_computable'::text,$n$);
  execute 'alter table public.cont_mapeos drop constraint cont_mapeos_clave_check';
  execute 'alter table public.cont_mapeos add constraint cont_mapeos_clave_check ' || v;
end $c$;

do $p$
declare v text;
begin
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v,
$a$"impuestos_internos","otro"],"lookup":"tipo|jurisdicción → tipo"},$a$,
$n$"impuestos_internos","icl","idc","otro"],"lookup":"tipo|jurisdicción → tipo"},
    {"clave":"compras.itc_computable","etiqueta":"ITC computable (pago a cuenta de IVA)","descripcion":"El 45 % del impuesto a los combustibles líquidos (ICL/ITC) de las compras de gasoil de los proveedores marcados en su ficha: pago a cuenta de IVA (Ley 23.966, transporte de carga). El 55 % restante y el IDC van por «Percepciones e impuestos de compras». El asiento de IVA del mes lo usa hasta el impuesto a pagar y el resto queda en la cuenta para los meses siguientes.","rubros":["activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":[""],"lookup":"exacto"},$n$);
  v := pg_temp._una(v,
$a$percepciones de IVA y retenciones de IVA."$a$,
$n$percepciones de IVA y retenciones de IVA; el pago a cuenta del ITC, del de ITC computable."$n$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$when 'impuestos_internos' then 'Impuestos internos' when 'otro' then 'Otros tributos (sin clasificar)'$a$,
$n$when 'impuestos_internos' then 'Impuestos internos' when 'otro' then 'Otros tributos (sin clasificar)'
        when 'icl' then 'ICL/ITC combustibles líquidos (lo no computable)' when 'idc' then 'IDC dióxido de carbono'$n$);
  execute v;

  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'compras.proveedores' then$a$,
$n$    when 'compras.itc_computable' then
      select count(distinct t.factura_id) into v_n from public.pagos_factura_tributos t
        join public.pagos_facturas f on f.id = t.factura_id
        join public.pagos_proveedores pr on pr.id = f.proveedor_id
       where f.estado <> 'anulada' and f.fecha >= p_desde and t.tipo = 'icl' and pr.icl_computa_pago_a_cuenta;
    when 'compras.proveedores' then$n$);
  execute v;

  -- El asiento de la compra: 45 % del ICL a ITC computable.
  v := pg_get_functiondef('public._cont_prop_compra(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$  v_hay  boolean;
begin$a$,
$n$  v_hay  boolean;
  v_itcf boolean;
  v_itc  numeric(14,2);
begin$n$);
  v := pg_temp._una(v,
$a$select razon_social into v_rs from public.pagos_proveedores where id = f.proveedor_id;$a$,
$n$select razon_social, icl_computa_pago_a_cuenta into v_rs, v_itcf from public.pagos_proveedores where id = f.proveedor_id;$n$);
  v := pg_temp._una(v,
$a$    p := public._cont_prop_linea(p, 'compras.tributo',$a$,
$n$    -- ICL de un proveedor que computa (Ley 23.966, 20261001b): el 45 % es
    -- pago a cuenta de IVA; el 55 % sigue como tributo (costo).
    v_itc := case when t.tipo = 'icl' and coalesce(v_itcf, false) then round(t.importe * 0.45, 2) else 0 end;
    p := public._cont_prop_linea(p, 'compras.itc_computable', array[''], true, s * v_itc, null, null, null, g);
    p := public._cont_prop_linea(p, 'compras.tributo',$n$);
  v := pg_temp._una(v,
$a$           true, s * t.importe, null, null, null, g);$a$,
$n$           true, s * (t.importe - v_itc), null, null, null, g);$n$);
  execute v;
end $p$;

-- ── 2. El asiento mensual de IVA ────────────────────────────────────────
do $i$
declare v text;
begin
  v := pg_get_functiondef('public._cont_iva_calculo(bigint,boolean)'::regprocedure);
  v := pg_temp._una(v,
$a$  v_lin    jsonb;
begin$a$,
$n$  v_lin    jsonb;
  v_itc_c  bigint;
  v_itc_d  numeric(14,2) := 0;
  v_itc_h  numeric(14,2) := 0;
  v_itc_m  numeric(14,2) := 0;
  v_itc_s  numeric(14,2) := 0;
  v_itc_u  numeric(14,2) := 0;
begin$n$);
  v := pg_temp._una(v,
$a$  v_det := v_df - v_cf;
$a$,
$n$  v_det := v_df - v_cf;

  -- 1b) ITC computable (20261001b): pago a cuenta de IVA que se traslada.
  --     Disponible = saldo de la cuenta desde el inicio del ejercicio (con la
  --     apertura) hasta fin de mes, sin el asiento de IVA de este mes.
  --     itc_m = lo que entró este mes (el control contra los libros).
  v_itc_c := public._cont_cuenta_mapeada('compras.itc_computable', array['']);
  if v_itc_c is not null then
    select coalesce(sum(l.debe) filter (where a.fecha >= per.desde and a.tipo <> 'apertura'), 0),
           coalesce(sum(l.haber) filter (where a.fecha >= per.desde and a.tipo <> 'apertura'), 0),
           coalesce(sum(l.debe - l.haber), 0)
      into v_itc_d, v_itc_h, v_itc_s
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
     where l.cuenta_id = v_itc_c and a.estado = 'confirmado'
       and a.fecha between eje.desde and per.hasta
       and a.tipo <> 'cierre'
       and not (coalesce(a.origen_tabla, '') = 'cont_iva_mensual'
                and a.origen_id in (select i.id from public.cont_iva_mensual i where i.periodo_id = p_periodo_id));
    v_itc_m := v_itc_d - v_itc_h;
    v_itc_s := greatest(v_itc_s, 0);
    if v_itc_d <> 0 or v_itc_h <> 0 or v_itc_s <> 0 then
      v_cuentas := v_cuentas || (select jsonb_build_object('cuenta_id', c.id, 'codigo', c.codigo, 'nombre', c.nombre,
                                                           'rol', 'itc', 'debe', v_itc_d, 'haber', v_itc_h, 'saldo', v_itc_s)
                                   from public.cont_cuentas c where c.id = v_itc_c);
    end if;
  end if;
$n$);
  v := pg_temp._una(v,
$a$  v_x     := greatest(v_det - v_tec_u, 0);
$a$,
$n$  v_x     := greatest(v_det - v_tec_u, 0);
  -- El ITC solo cancela impuesto: lo que sobra queda en su cuenta.
  v_itc_u := least(v_itc_s, v_x);
  v_x     := v_x - v_itc_u;
$n$);
  v := pg_temp._una(v,
$a$  p := public._cont_prop_linea(p, 'iva.ddjj', array['saldo_a_favor'], false, v_tec_u, null, null, null, g);
$a$,
$n$  p := public._cont_prop_linea(p, 'iva.ddjj', array['saldo_a_favor'], false, v_tec_u, null, null, null, g);
  p := public._cont_prop_linea(p, null, null, false, v_itc_u, null, null, null, g || ' — pago a cuenta ITC', v_itc_c);
$n$);
  v := pg_temp._una(v,
$a$'arrastre_tecnico', v_tec_u, 'arrastre_libre', v_lib_u,$a$,
$n$'arrastre_tecnico', v_tec_u, 'arrastre_libre', v_lib_u,
    'itc_mes', v_itc_m, 'itc_disponible', v_itc_s, 'itc_computado', v_itc_u, 'itc_remanente', v_itc_s - v_itc_u,$n$);
  execute v;

  v := pg_get_functiondef('public._cont_iva_diferencias(jsonb,jsonb)'::regprocedure);
  v := pg_temp._una(v,
$a$      union all
      select 4, 'excluidos'$a$,
$n$      union all
      select 4, 'itc', coalesce((p_calc ->> 'itc_mes')::numeric, 0), (p_fiscal ->> 'pago_a_cuenta_itc')::numeric
       where p_fiscal ? 'pago_a_cuenta_itc'
      union all
      select 5, 'excluidos'$n$);
  execute v;
end $i$;

comment on function public._cont_iva_calculo(bigint, boolean) is
  'Posición de IVA del mes desde el mayor: DF − CF, saldo técnico arrastrado, ITC computable (20261001b: hasta el impuesto, el resto queda en la cuenta), percepciones/retenciones y libre disponibilidad. Única fuente del asiento mensual de IVA (20260928o).';

-- ── 3. Plan y mapeos ────────────────────────────────────────────────────
do $m$
declare
  c_user constant uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_tuc  bigint;
begin
  v_tuc := (public.cont_guardar_cuenta(jsonb_build_object(
    'codigo', '1.1.4.01.19', 'nombre', 'Saldo a favor IIBB Tucumán', 'imputable', true,
    'obs', 'Contador 25/09: percepciones de IIBB de Tucumán (jurisdicción 24).'), c_user) ->> 'id')::bigint;

  perform public.cont_guardar_mapeos((
    select jsonb_agg(jsonb_build_object('clave', m.clave, 'subclave', m.sub, 'cuenta_id',
             coalesce(m.cta_id, (select c.id from public.cont_cuentas c where c.codigo = m.codigo))))
      from (values
        ('compras.itc_computable', '',                   '1.1.4.01.12', null::bigint),  -- ITC COMPUTABLE
        ('compras.tributo',        'icl',                '4.2.1.07.16', null),          -- Itc no computable (55 %)
        ('compras.tributo',        'idc',                '4.2.1.07.15', null),          -- IDC
        ('compras.tributo',        'percepcion_iibb|2',  '1.1.4.01.13', null),          -- Buenos Aires
        ('compras.tributo',        'percepcion_iibb|4',  '1.1.4.01.14', null),          -- Córdoba
        ('compras.tributo',        'percepcion_iibb|8',  '1.1.4.01.15', null),          -- Entre Ríos
        ('compras.tributo',        'percepcion_iibb|11', '1.1.4.01.16', null),          -- La Pampa
        ('compras.tributo',        'percepcion_iibb|13', '1.1.4.01.17', null),          -- Mendoza
        ('compras.tributo',        'percepcion_iibb|24', null,          v_tuc)          -- Tucumán
      ) as m(clave, sub, codigo, cta_id)), c_user);

  if (select count(*) from public.cont_mapeos
       where clave in ('compras.itc_computable', 'compras.tributo')
         and subclave in ('', 'icl', 'idc', 'percepcion_iibb|2', 'percepcion_iibb|4', 'percepcion_iibb|8',
                          'percepcion_iibb|11', 'percepcion_iibb|13', 'percepcion_iibb|24')) <> 9 then
    raise exception 'MAPEOS_INCOMPLETOS';
  end if;
end $m$;

notify pgrst, 'reload schema';
