-- Dos funciones de trigger SECURITY DEFINER quedaron ejecutables por anon y
-- authenticated (lo marca el advisor de seguridad):
--   · audit_borrado(): `create or replace` conserva los permisos que ya tenía.
--   · fn_item_vinculado_descuenta_stock(): nació así en 20261005b.
-- Al ser de trigger no se pueden llamar por RPC, pero no tienen por qué ser
-- ejecutables por los roles del cliente. Postgres mira EXECUTE al crear el
-- trigger, no al dispararlo: los triggers siguen andando (probado con rollback:
-- un DELETE como service_role sobre sueldos_escalas dejó su fila en audit_log).

revoke execute on function public.audit_borrado() from public, anon, authenticated;
revoke execute on function public.fn_item_vinculado_descuenta_stock() from public, anon, authenticated;
