-- =====================================================================
-- 20261001a — Compras: ICL e IDC como tipos de tributo, el proveedor que
-- computa el ICL como pago a cuenta de IVA, la Tasa Vial de YPF como costo
-- y la jurisdicción de las percepciones de IIBB sin provincia (2026-09-25)
--
-- Regla del dueño (25/09, Ley 23.966, art. s/n a continuación del 15):
-- CADINC está inscripta como transportista de carga y computa como PAGO A
-- CUENTA DE IVA el 45 % del Impuesto sobre los Combustibles Líquidos (ICL/ITC,
-- Capítulo I) de sus compras de gasoil para camiones. El Impuesto al Dióxido
-- de Carbono (IDC, Capítulo II) NO se computa. El remanente se traslada a los
-- meses siguientes. La contabilidad va en 20261001b.
--
-- 1. pagos_factura_tributos.tipo suma 'icl' e 'idc'. No son percepciones:
--    siguen sumando a `otros` y NO cambian `imputable` (total − percepciones).
--    En el Libro IVA compras se informan como hasta hoy («otros tributos»).
-- 2. pagos_completar_desglose acepta los dos tipos nuevos.
-- 3. pagos_proveedores.icl_computa_pago_a_cuenta (default false), expuesto en
--    v_pagos_proveedores. YPF (95) y Petronorte (31) = true.
-- 4. Datos YPF: las filas «otro» de ICL e IDC pasan a icl / idc (por la
--    descripción del papel). Petronorte NO se toca: sus tributos están
--    agrupados en «otro» (salvo la #44, cuya descripción es otra; se decide aparte).
-- 5. Tasa Vial de YPF (Campana, Garín; contador 25/09): es COSTO, no
--    percepción. Pasa de percepcion_municipal a impuestos_internos (que ya
--    mapea a 4.2.1.07.07 «Impuestos internos y varios»). Como baja
--    `percepciones`, sube `imputable`: la imputación (una obra por factura)
--    se reescribe por la puerta única `_pagos_reemplazar_imputaciones`.
-- 6. Percepciones de IIBB sin jurisdicción (importadas de ARCA antes del
--    catálogo): toman la jurisdicción por defecto de Compras ›
--    Configuración (pagos_config.tributo_jurisdiccion_default_id = Tucumán).
--
-- Todo por las puertas: `_pagos_guardar_desglose` (tributos) y
-- `_pagos_reemplazar_imputaciones` (reparto), con `cadinc.pagos_desglose`
-- como pagos_completar_desglose. Usuario: Franco Leiro (admin).
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

-- ── 1. Tipos de tributo ─────────────────────────────────────────────────
alter table public.pagos_factura_tributos drop constraint pagos_factura_tributos_tipo_check;
alter table public.pagos_factura_tributos add constraint pagos_factura_tributos_tipo_check
  check (tipo = any (array['percepcion_iva', 'percepcion_iibb', 'percepcion_ganancias', 'percepcion_municipal',
                           'impuestos_internos', 'icl', 'idc', 'otro']));

comment on column public.pagos_factura_tributos.tipo is
  'percepcion_* (crédito fiscal, no va a las obras) | impuestos_internos | icl (Impuesto sobre los Combustibles Líquidos, ITC) | idc (Impuesto al Dióxido de Carbono) | otro. icl/idc: 20261001a.';

-- ── 2. pagos_completar_desglose ─────────────────────────────────────────
do $p$
declare v text := pg_get_functiondef('public.pagos_completar_desglose(bigint,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v, $a$'percepcion_municipal','impuestos_internos','otro')) then$a$,
                       $n$'percepcion_municipal','impuestos_internos','icl','idc','otro')) then$n$);
  execute v;
end $p$;

-- ── 3. El proveedor que computa el ICL ──────────────────────────────────
alter table public.pagos_proveedores
  add column icl_computa_pago_a_cuenta boolean not null default false;

comment on column public.pagos_proveedores.icl_computa_pago_a_cuenta is
  'El 45 % del ICL (tributo icl) de sus facturas se computa como pago a cuenta de IVA (transporte de carga, gasoil; Ley 23.966). El IDC nunca. Se edita en la ficha. 20261001a.';

do $v$
declare
  v_def text := pg_get_viewdef('public.v_pagos_proveedores'::regclass, true);
  v_ancla text := E'\n   FROM pagos_proveedores p';
begin
  if position('icl_computa_pago_a_cuenta' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ANCLA_NO_UNICA';
  end if;
  v_def := rtrim(replace(v_def, v_ancla, E',\n    p.icl_computa_pago_a_cuenta' || v_ancla), E'; \n');
  execute 'create or replace view public.v_pagos_proveedores as ' || v_def;
end $v$;

-- ── 4–6. Datos ──────────────────────────────────────────────────────────
do $m$
declare
  c_user constant uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  c_icl  constant text := 'Impuesto sobre los Combustibles Líquidos (ICL/ITC)';
  c_idc  constant text := 'Impuesto al Dióxido de Carbono (IDC)';
  v_f    bigint;
  v_trib jsonb;
  v_imp  record;
  v_nimp int;
  v_jur  bigint;
  v_n_icl int; v_s_icl numeric; v_n_idc int; v_s_idc numeric;
  v_n_tv int := 0; v_s_tv numeric := 0; v_n_reimp int := 0;
  v_n_iibb int; v_s_iibb numeric;
begin
  -- Proveedores.
  update public.pagos_proveedores set icl_computa_pago_a_cuenta = true, updated_by = c_user
   where (id = 95 and razon_social = 'YPF SOCIEDAD ANONIMA') or (id = 31 and razon_social = 'PETRONORTE SA');
  if (select count(*) from public.pagos_proveedores where icl_computa_pago_a_cuenta) <> 2 then
    raise exception 'PROVEEDORES_ICL_NO_ENCONTRADOS';
  end if;

  perform set_config('cadinc.pagos_desglose', 'on', true);

  -- 4 y 5: YPF, factura por factura por la puerta del desglose.
  for v_f in
    select distinct t.factura_id
      from public.pagos_factura_tributos t join public.pagos_facturas f on f.id = t.factura_id
     where f.proveedor_id = 95
       and ((t.tipo = 'otro' and t.descripcion in (c_icl, c_idc))
            or (t.tipo = 'percepcion_municipal' and t.descripcion ilike 'Tasa Vial%'))
     order by 1
  loop
    select jsonb_agg(jsonb_build_object(
             'tipo', case when t.tipo = 'otro' and t.descripcion = c_icl then 'icl'
                          when t.tipo = 'otro' and t.descripcion = c_idc then 'idc'
                          when t.tipo = 'percepcion_municipal' and t.descripcion ilike 'Tasa Vial%' then 'impuestos_internos'
                          else t.tipo end,
             'jurisdiccion', t.jurisdiccion, 'jurisdiccion_id', t.jurisdiccion_id,
             'descripcion', t.descripcion, 'alicuota', t.alicuota,
             'base_imp', t.base_imp, 'importe', t.importe) order by t.id)
      into v_trib
      from public.pagos_factura_tributos t where t.factura_id = v_f;
    perform public._pagos_guardar_desglose(v_f, null, v_trib);

    -- Bajaron las percepciones (Tasa Vial): la imputación sube a total − percepciones.
    select count(*) into v_nimp from public.pagos_imputaciones where factura_id = v_f;
    if v_nimp > 0 and abs((select coalesce(sum(monto), 0) from public.pagos_imputaciones where factura_id = v_f)
                          - (select imputable from public.pagos_facturas where id = v_f)) > 0.01 then
      if v_nimp <> 1 then
        raise exception 'IMPUTACION_VARIAS_OBRAS factura %', v_f;
      end if;
      select obra_cod, obs into v_imp from public.pagos_imputaciones where factura_id = v_f;
      perform public._pagos_reemplazar_imputaciones(v_f,
        jsonb_build_array(jsonb_build_object('obra_cod', v_imp.obra_cod,
                                             'monto', (select imputable from public.pagos_facturas where id = v_f),
                                             'obs', v_imp.obs)), c_user);
      v_n_reimp := v_n_reimp + 1;
    end if;
  end loop;

  -- 6: percepciones de IIBB sin jurisdicción → la de Compras › Configuración.
  -- Solo la jurisdicción (no es plata): el trigger pone el nombre canónico.
  v_jur := (select (valor #>> '{}')::bigint from public.pagos_config where clave = 'tributo_jurisdiccion_default_id');
  if v_jur is distinct from 24 then
    raise exception 'JURISDICCION_DEFAULT_INESPERADA %', v_jur;
  end if;
  select count(*), coalesce(sum(importe), 0) into v_n_iibb, v_s_iibb
    from public.pagos_factura_tributos where tipo = 'percepcion_iibb' and jurisdiccion_id is null;
  update public.pagos_factura_tributos set jurisdiccion_id = v_jur
   where tipo = 'percepcion_iibb' and jurisdiccion_id is null;

  perform set_config('cadinc.pagos_desglose', '', true);

  -- Control.
  select count(*) filter (where t.tipo = 'icl'), coalesce(sum(t.importe) filter (where t.tipo = 'icl'), 0),
         count(*) filter (where t.tipo = 'idc'), coalesce(sum(t.importe) filter (where t.tipo = 'idc'), 0)
    into v_n_icl, v_s_icl, v_n_idc, v_s_idc
    from public.pagos_factura_tributos t;
  select count(*), coalesce(sum(t.importe), 0) into v_n_tv, v_s_tv
    from public.pagos_factura_tributos t join public.pagos_facturas f on f.id = t.factura_id
   where f.proveedor_id = 95 and t.descripcion ilike 'Tasa Vial%' and t.tipo = 'impuestos_internos';
  if exists (select 1 from public.pagos_facturas f
              where f.proveedor_id = 95 and exists (select 1 from public.pagos_imputaciones i where i.factura_id = f.id)
                and abs(f.imputable - (select sum(monto) from public.pagos_imputaciones i where i.factura_id = f.id)) > 0.01) then
    raise exception 'IMPUTACION_NO_CUADRA_YPF';
  end if;

  raise notice 'RESULTADO icl=% ($%) idc=% ($%) tasa_vial=% ($%) reimputadas=% iibb_con_jurisdiccion=% ($%)',
    v_n_icl, v_s_icl, v_n_idc, v_s_idc, v_n_tv, v_s_tv, v_n_reimp, v_n_iibb, v_s_iibb;
end $m$;

notify pgrst, 'reload schema';
