-- Las funciones sueltas del módulo Pagos, cerradas como el resto (2026-09-18)
--
-- `20260918a` creó `hoy_ar()`, `cbu_valido(text)` y las diez funciones de
-- trigger `fn_pagos_*` sin el `revoke` que sí llevan las RPC del módulo, así
-- que quedaron con EXECUTE para PUBLIC. La auditoría independiente de la
-- aplicación lo marcó: `anon` tiene USAGE sobre `public`, o sea que
-- `/rest/v1/rpc/cbu_valido` y `/rpc/hoy_ar` eran llamables de verdad con la
-- anon key.
--
-- No filtraban nada — son puras, no tocan tablas: una dice si un CBU tiene
-- los verificadores bien y la otra devuelve la fecha de hoy en hora
-- argentina. Pero el criterio de la casa (`20260527_revoke_secdef_from_public`
-- y todas las RPC de este módulo) es que lo único ejecutable desde afuera sea
-- lo que el backend expone, y estas dos no lo son.
--
-- Las `fn_pagos_*` van en la misma tanda por prolijidad: devuelven `trigger`,
-- PostgREST no las expone y fuera del contexto de un trigger fallan, así que
-- no eran alcanzables; pero no hay motivo para dejarlas abiertas.
--
-- Nada de esto afecta al backend, que llama como `service_role`, ni al CHECK
-- `pagos_proveedores_cbu_check`: el único que escribe en esas tablas es el
-- backend, y conserva el EXECUTE.

revoke all on function public.hoy_ar()          from public, anon, authenticated;
revoke all on function public.cbu_valido(text)  from public, anon, authenticated;
grant execute on function public.hoy_ar()         to service_role;
grant execute on function public.cbu_valido(text) to service_role;

do $$
declare f record; n int := 0;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'fn\_pagos\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    n := n + 1;
  end loop;
  if n <> 10 then raise exception 'FN_PAGOS_INESPERADAS: % (esperado 10)', n; end if;
end $$;
