-- =====================================================================
-- 20260929c — Una nota de crédito puede usar un producto dado de baja
--
-- 20260929b hizo que un borrador rechace un producto inactivo
-- (PRODUCTO_INACTIVO) salvo que sea el mismo que ya tenía. Una NC (3, 8,
-- 203) repite el producto de la factura que anula: si ese producto se dio
-- de baja después, la NC no se podía emitir. Se exime a las NC.
-- Parche por ancla sobre la definición viva.
-- =====================================================================
create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text language plpgsql as $f$
declare v_n int := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
begin
  if v_n <> 1 then raise exception 'ANCLA % veces: %', v_n, left(p_ancla, 80); end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

do $m$
declare v_def text := pg_get_functiondef('public.ventas_guardar_borrador'::regproc);
begin
  v_def := pg_temp._una(v_def,
    'if not v_prod.activo and v_prod.id is distinct from v_old.producto_id then',
    'if not v_prod.activo and v_prod.id is distinct from v_old.producto_id and coalesce(v_tipo, 0) not in (3, 8, 203) then');
  execute v_def;
end $m$;
