-- =====================================================================
-- Compras: concepto y centro de costo habituales del proveedor
-- (2026-09-25, serie 20260930)
--
-- Pedido del dueño, después de imputar a mano las facturas de Truck NOA
-- (service de camiones) con «Mantenimiento y repuestos» y la obra CC-020
-- Áridos: que el proveedor recuerde a qué se imputa lo suyo.
--
-- 1. pagos_proveedores.concepto_habitual_id (→ pagos_conceptos) y
--    obra_habitual_cod (→ obras.cod). Nullables. Se editan en la ficha.
-- 2. v_pagos_proveedores las expone (al final, como 20260930b).
-- 3. El importador de «Mis Comprobantes Recibidos»:
--    · con concepto habitual (activo), el comprobante nace con ese concepto
--      (sigue sin_imputar: el CHECK concepto_o_sin_imputar lo permite);
--    · con concepto Y obra, además se imputa con pagos_imputar_lote: UNA
--      imputación a la obra por el imputable (total − percepciones). Best
--      effort: si la imputación se rechaza (tributos a revisar, obra
--      archivada, lo que sea) queda sin_imputar como hasta hoy, sin tirar la
--      importación. La fila del resultado dice `imputada_habitual`.
--    En la carga a mano lo precarga el frontend (ModalCargarFactura).
-- 4. Datos: Truck NOA (183) → concepto 4, obra CC-020.
-- 5. ARREGLO de 20260930a: el plan de cheques del importador llegaba como
--    jsonb 'null' (no NULL de SQL) y los CHECK lo rechazaban: la importación
--    de «Mis Comprobantes» fallaba en todas las filas sin cheque previsto.
-- =====================================================================

alter table public.pagos_proveedores
  add column concepto_habitual_id bigint references public.pagos_conceptos(id),
  add column obra_habitual_cod text references public.obras(cod);

comment on column public.pagos_proveedores.concepto_habitual_id is
  'Concepto con que se imputan normalmente sus comprobantes: lo precarga la carga a mano y lo pone el importador de ARCA. Null = sin preferencia. 20260930p.';
comment on column public.pagos_proveedores.obra_habitual_cod is
  'Centro de costo (obra) al que se imputa normalmente lo suyo, al 100 %. Con concepto habitual, el importador de ARCA deja sus comprobantes imputados. Null = sin preferencia. 20260930p.';

-- ── La vista expone las dos columnas ─────────────────────────────────
do $v$
declare
  v_def text := pg_get_viewdef('public.v_pagos_proveedores'::regclass, true);
  v_ancla text := E'\n   FROM pagos_proveedores p';
begin
  if position('concepto_habitual_id' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ANCLA_NO_UNICA';
  end if;
  v_def := rtrim(replace(v_def, v_ancla, E',\n    p.concepto_habitual_id,\n    p.obra_habitual_cod' || v_ancla), E'; \n');
  execute 'create or replace view public.v_pagos_proveedores as ' || v_def;
end $v$;

-- ── El importador usa lo habitual ────────────────────────────────────
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
  v text := pg_get_functiondef('public.pagos_importar_recibidos'::regproc);
begin
  -- 1) variables
  v := pg_temp._una(v,
    E'  v_piva     date;\nbegin',
    E'  v_piva     date;\n  v_conc_hab bigint;\n  v_obra_hab text;\n  v_imput    boolean;\nbegin');
  -- 2) antes del alta: lo habitual del proveedor (concepto solo si está activo)
  v := pg_temp._una(v,
    E'    -- 10) Alta (solo confirmando y sin error).\n    if v_err is null and v_dup is null and p_confirmar then\n      begin',
    E'    -- 10) Alta (solo confirmando y sin error).\n    v_imput := false; v_conc_hab := null; v_obra_hab := null;\n    if v_err is null and v_dup is null and p_confirmar then\n      -- Concepto y obra habituales del proveedor (20260930p).\n      select c.id, p.obra_habitual_cod into v_conc_hab, v_obra_hab\n        from public.pagos_proveedores p\n        join public.pagos_conceptos c on c.id = p.concepto_habitual_id and c.activo\n       where p.id = v_prov;\n      begin');
  -- 3) el insert lleva el concepto habitual
  v := pg_temp._una(v,
    E'          v_clase, null, v_piva,',
    E'          v_clase, v_conc_hab, v_piva,');
  -- 4) después del alta: imputar con lo habitual, best effort
  v := pg_temp._una(v,
    E'        perform public._pagos_validar_desglose(v_f.neto, v_f.iva, v_f.percepciones, v_f.otros, v_f.total, v_f.no_gravado, v_f.exento);\n',
    E'        perform public._pagos_validar_desglose(v_f.neto, v_f.iva, v_f.percepciones, v_f.otros, v_f.total, v_f.no_gravado, v_f.exento);\n'
    || E'        -- Imputación habitual (20260930p): si se rechaza, queda sin imputar.\n'
    || E'        if v_conc_hab is not null and v_obra_hab is not null then\n'
    || E'          begin\n'
    || E'            perform public.pagos_imputar_lote(array[v_fid], v_conc_hab, v_obra_hab, p_user_id);\n'
    || E'            v_imput := true;\n'
    || E'          exception when others then\n'
    || E'            v_imput := false;\n'
    || E'          end;\n'
    || E'        end if;\n');
  -- 5) ARREGLO de 20260930a: `-> 'plan_cheques'` de un objeto con valor null
  --    da el jsonb 'null', no un NULL de SQL, y pagos_facturas_plan_cheques_chk
  --    (y pagos_facturas_nc_chk en las NC) lo rechazan: desde esa migración
  --    TODA fila sin cheque previsto fallaba con FILA_INVALIDA y la
  --    importación entera caía con IMPORTACION_CON_ERRORES.
  v := pg_temp._una(v,
    E'public._pagos_prevision_pago(v_prov, v_fecha, v_clase, v_tipo) -> ''plan_cheques'')\n        returning id into v_fid;',
    E'nullif(public._pagos_prevision_pago(v_prov, v_fecha, v_clase, v_tipo) -> ''plan_cheques'', ''null''::jsonb))\n        returning id into v_fid;');
  -- 6) el resultado lo dice
  v := pg_temp._una(v,
    E'      ''factura_id'', v_fid, ',
    E'      ''factura_id'', v_fid, ''imputada_habitual'', v_imput, ');
  execute v;
end $m$;

-- ── Datos: Truck NOA ─────────────────────────────────────────────────
update public.pagos_proveedores
   set concepto_habitual_id = 4, obra_habitual_cod = 'CC-020'
 where id = 183 and razon_social = 'TRUCK NOA SA';
