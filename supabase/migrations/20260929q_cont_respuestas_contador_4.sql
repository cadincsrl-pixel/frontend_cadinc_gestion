-- 20260929q — Respuestas del contador (cuarta tanda, 25/09).
--
-- Todo pasa por las puertas únicas: cont_guardar_cuenta (plan),
-- cont_guardar_mapeos (mapeos), tesoreria_guardar_concepto (conceptos de
-- fondos) y _pagos_guardar_desglose (tributos de compras). Usuario: Franco
-- Leiro (admin), a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8. No contabiliza nada:
-- el dueño aprieta «Contabilizar» desde la pantalla.
--
-- 1. iva.ddjj: a pagar → 2.1.3.01.05; saldo técnico → 1.1.4.01.07; libre
--    disponibilidad → 1.1.4.01.09.
-- 2. fondos.concepto por concepto. «Intereses pagados» pasa a «Intereses
--    bancarios pagados» y nace «Intereses impositivos» (→ 4.2.1.05.03, que ya
--    existía: no se duplica). F.931 va a 2.1.2.02.02 «F.931 a pagar», que YA
--    existía bajo CARGAS SOCIALES A PAGAR (no se crea otra). Ley 25413 se
--    computa entera como pago a cuenta de Ganancias (1.1.4.01.06).
--    «Cobro sin factura» y «Pago sin factura» se desactivan si no tienen
--    movimientos. «Otro» queda sin mapeo.
-- 3. bienes.gasto por rubro. Inmuebles → cuenta nueva 4.2.1.03.20
--    «Amortización inmuebles». Terrenos sin mapeo (no se amortizan).
-- 4. cobros.retencion|otra → cuenta nueva 1.1.4.01.18 «Otras retenciones
--    sufridas».
-- 5. «Otros tributos» de ARCA → percepcion_iibb SOLO si importe/neto ≤ 5 % y
--    la fila es la genérica del importador («Otros tributos según ARCA (sin
--    clasificar)»): quedan afuera el IDC de Petronorte y la TEM de Silva, que
--    tienen descripción del papel y no son IIBB. Jurisdicción sin tocar (null).
--    tributos_a_revisar se limpia solo donde no quedó ningún «otro».
--    Todos los períodos afectados (jul–sep 2026) están abiertos y sin DDJJ.

do $m$
declare
  c_user constant uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  c_desc constant text := 'Otros tributos según ARCA (sin clasificar)';
  v_cta_inm   bigint;
  v_cta_otra  bigint;
  v_con_imp   bigint;
  v_f         bigint;
  v_trib      jsonb;
  v_n_fact    int := 0;
  v_n_rows    int := 0;
  v_monto     numeric := 0;
  v_limpias   int := 0;
  v_desact    int := 0;

begin
  -- ── Plan de cuentas ─────────────────────────────────────────────────────
  v_cta_inm := (public.cont_guardar_cuenta(jsonb_build_object(
    'codigo', '4.2.1.03.20', 'nombre', 'Amortización inmuebles', 'imputable', true,
    'obs', 'Contador 25/09: gasto de amortización del rubro Inmuebles (1.2.2.01).'), c_user) ->> 'id')::bigint;
  v_cta_otra := (public.cont_guardar_cuenta(jsonb_build_object(
    'codigo', '1.1.4.01.18', 'nombre', 'Otras retenciones sufridas', 'imputable', true,
    'obs', 'Contador 25/09: retenciones sufridas de tipo «otra».'), c_user) ->> 'id')::bigint;

  -- ── Conceptos de fondos ─────────────────────────────────────────────────
  perform public.tesoreria_guardar_concepto(jsonb_build_object('id', 4, 'nombre', 'Intereses bancarios pagados'), c_user);
  v_con_imp := (public.tesoreria_guardar_concepto(jsonb_build_object(
    'nombre', 'Intereses impositivos', 'sentido', 'egreso', 'orden', 4,
    'obs', 'Intereses y recargos de ARCA / Rentas (contador 25/09).'), c_user) ->> 'id')::bigint;

  if not exists (select 1 from public.tesoreria_movimientos where concepto_id = 12) then
    perform public.tesoreria_guardar_concepto(jsonb_build_object('id', 12, 'activo', false), c_user);
    v_desact := v_desact + 1;
  else
    raise notice 'Concepto 12 (Cobro sin factura) tiene movimientos: queda activo';
  end if;
  if not exists (select 1 from public.tesoreria_movimientos where concepto_id = 13) then
    perform public.tesoreria_guardar_concepto(jsonb_build_object('id', 13, 'activo', false), c_user);
    v_desact := v_desact + 1;
  else
    raise notice 'Concepto 13 (Pago sin factura) tiene movimientos: queda activo';
  end if;

  -- ── Mapeos ──────────────────────────────────────────────────────────────
  perform public.cont_guardar_mapeos((
    select jsonb_agg(jsonb_build_object('clave', m.clave, 'subclave', m.sub, 'cuenta_id',
             coalesce(m.cta_id, (select c.id from public.cont_cuentas c where c.codigo = m.codigo))))
      from (values
        ('iva.ddjj',        'a_pagar',               '2.1.3.01.05', null::bigint),
        ('iva.ddjj',        'saldo_a_favor',         '1.1.4.01.07', null),
        ('iva.ddjj',        'libre_disponibilidad',  '1.1.4.01.09', null),
        ('fondos.concepto', '1',                     '4.2.1.05.01', null),  -- Comisiones y gastos bancarios
        ('fondos.concepto', '2',                     '1.1.4.01.06', null),  -- Ley 25413: se computa el total
        ('fondos.concepto', '3',                     '4.1.1.03.01', null),  -- Intereses ganados
        ('fondos.concepto', '4',                     '4.2.1.05.01', null),  -- Intereses bancarios pagados
        ('fondos.concepto', v_con_imp::text,         '4.2.1.05.03', null),  -- Intereses impositivos
        ('fondos.concepto', '5',                     '2.1.3.01.05', null),  -- VEP IVA
        ('fondos.concepto', '6',                     '2.1.3.02.01', null),  -- VEP IIBB
        ('fondos.concepto', '7',                     '2.1.2.02.02', null),  -- F.931 a pagar (ya existía)
        ('fondos.concepto', '8',                     '2.1.2.01',    null),  -- Pago de sueldos
        ('fondos.concepto', '9',                     '1.1.4.02.01', null),  -- Retiro de socios
        ('fondos.concepto', '10',                    '1.1.4.02.01', null),  -- Aporte de socios
        ('fondos.concepto', '11',                    '4.2.1.03.10', null),  -- Gasto menor sin comprobante
        ('fondos.concepto', '14',                    '1.1.1.01.06', null),  -- Depósito de valores
        ('bienes.gasto',    '1.2.2.01',              null,          v_cta_inm),  -- Inmuebles
        ('bienes.gasto',    '1.2.2.02',              '4.2.1.02.10', null),  -- Maquinarias y equipos
        ('bienes.gasto',    '1.2.2.03',              '4.2.1.03.05', null),  -- Muebles y útiles
        ('bienes.gasto',    '1.2.2.04',              '4.2.1.02.10', null),  -- Rodados (camiones de la operación)
        ('bienes.gasto',    '1.2.2.08',              '4.2.1.03.05', null),  -- Instalaciones
        ('bienes.gasto',    '1.2.2.09',              '4.2.1.02.10', null),  -- Herramientas
        ('cobros.retencion','otra',                  null,          v_cta_otra)
      ) as m(clave, sub, codigo, cta_id)), c_user);

  -- ── «Otros tributos» → percepción IIBB (≤ 5 % del neto) ─────────────────
  perform set_config('cadinc.pagos_desglose', 'on', true);
  for v_f in
    select distinct t.factura_id
      from public.pagos_factura_tributos t
      join public.pagos_facturas f on f.id = t.factura_id
     where t.tipo = 'otro' and t.descripcion = c_desc and f.estado <> 'anulada'
       and f.neto is not null and f.neto > 0 and t.importe / f.neto <= 0.05
     order by 1
  loop
    select jsonb_agg(jsonb_build_object(
             'tipo', case when t.tipo = 'otro' and t.descripcion = c_desc and t.importe / f.neto <= 0.05
                          then 'percepcion_iibb' else t.tipo end,
             'jurisdiccion', t.jurisdiccion, 'jurisdiccion_id', t.jurisdiccion_id,
             'descripcion', t.descripcion, 'alicuota', t.alicuota,
             'base_imp', t.base_imp, 'importe', t.importe) order by t.id),
           count(*) filter (where t.tipo = 'otro' and t.descripcion = c_desc and t.importe / f.neto <= 0.05),
           coalesce(sum(t.importe) filter (where t.tipo = 'otro' and t.descripcion = c_desc and t.importe / f.neto <= 0.05), 0)
             + v_monto
      into v_trib, v_n_fact, v_monto
      from public.pagos_factura_tributos t
      join public.pagos_facturas f on f.id = t.factura_id
     where t.factura_id = v_f;
    v_n_rows := v_n_rows + v_n_fact;
    perform public._pagos_guardar_desglose(v_f, null, v_trib);

    if not exists (select 1 from public.pagos_factura_tributos where factura_id = v_f and tipo = 'otro') then
      update public.pagos_facturas set tributos_a_revisar = false, updated_by = c_user
       where id = v_f and tributos_a_revisar;
      if found then v_limpias := v_limpias + 1; end if;
    end if;
  end loop;
  perform set_config('cadinc.pagos_desglose', '', true);

  raise notice 'RESULTADO cuentas=[%,%] concepto_nuevo=% desactivados=% filas_iibb=% monto_iibb=% facturas_limpias=%',
    v_cta_inm, v_cta_otra, v_con_imp, v_desact, v_n_rows, v_monto, v_limpias;
end $m$;
