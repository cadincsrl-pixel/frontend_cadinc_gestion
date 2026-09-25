-- =====================================================================
-- v_pagos_proveedores expone forma_pago_habitual (20260930a)
-- (2026-09-25, serie 20260930)
--
-- La vista lista las columnas del proveedor una por una: la nueva no aparece
-- sola. Se agrega AL FINAL (create or replace view sólo admite sumar columnas
-- al final) tomando la definición viva, para no reescribir a mano una vista
-- que ya tocaron varias migraciones.
-- =====================================================================

do $v$
declare
  v_def text := pg_get_viewdef('public.v_pagos_proveedores'::regclass, true);
  v_ancla text := E'\n   FROM pagos_proveedores p';
begin
  if position('forma_pago_habitual' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ANCLA_NO_UNICA';
  end if;
  v_def := rtrim(replace(v_def, v_ancla, E',\n    p.forma_pago_habitual' || v_ancla), E'; \n');
  execute 'create or replace view public.v_pagos_proveedores as ' || v_def;
end $v$;
