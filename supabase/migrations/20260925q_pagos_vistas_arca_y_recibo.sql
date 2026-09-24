-- =====================================================================
-- Compras: vistas con los datos de ARCA y el «tiene recibo» (2026-09-25)
--
-- Por qué: la lista/ficha de proveedores muestra domicilio, provincia,
-- condición IVA, actividad y fecha de consulta a ARCA (20260925o); la
-- bandeja de órdenes muestra el chip «recibo ✓ / sin recibo» y filtra
-- «sin recibo» (tipo de adjunto 'recibo_proveedor', 20260925p).
--
-- Columnas nuevas, SIEMPRE AL FINAL:
--   · v_pagos_proveedores: domicilio, provincia, condicion_iva_id,
--     tipo_persona, actividad_principal, padron_json, padron_consultado_at.
--   · v_pagos_ordenes: tiene_recibo boolean = existe un adjunto VIGENTE
--     (deleted_at is null) tipo 'recibo_proveedor' de esa OP.
--
-- Técnica (como 20260925l): definición VIVA + reemplazo contado. Ninguna de
-- las dos vistas tiene reloptions (sin security_invoker) y quedan igual.
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

-- ── 1) v_pagos_proveedores ─────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_proveedores'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$p.codigo
   FROM $a$,
$a$p.codigo,
    p.domicilio,
    p.provincia,
    p.condicion_iva_id,
    p.tipo_persona,
    p.actividad_principal,
    p.padron_json,
    p.padron_consultado_at
   FROM $a$);
  execute 'create or replace view public.v_pagos_proveedores as ' || v;
end $m$;

-- ── 2) v_pagos_ordenes ─────────────────────────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_ordenes'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$p.codigo AS proveedor_codigo
   FROM $a$,
$a$p.codigo AS proveedor_codigo,
    (EXISTS ( SELECT 1 FROM pagos_ordenes_adjuntos ra
              WHERE ra.orden_id = o.id AND ra.tipo = 'recibo_proveedor'::text AND ra.deleted_at IS NULL)) AS tiene_recibo
   FROM $a$);
  execute 'create or replace view public.v_pagos_ordenes as ' || v;
end $m$;

drop function pg_temp._una(text, text, text);
