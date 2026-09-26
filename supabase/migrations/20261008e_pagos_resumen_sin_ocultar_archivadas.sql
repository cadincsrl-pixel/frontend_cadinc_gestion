-- Compras: las obras archivadas no esconden nada (dueño, 27/09/2026).
--
-- «Que la obra esté archivada por un tema operativo en otro módulo no
-- significa que en la contabilidad se tenga que ocultar: siempre se tiene que
-- mostrar todo». La bandeja de facturas escondía las imputadas solo a obras
-- archivadas (caso: FA 25-25456 de Silva, $79.588,11, imputada a CC-019
-- Hipódromo, pendiente y vencida sin que se viera). El backend ya no filtra;
-- acá `pagos_resumen` deja de hacerlo aunque le pasen p_archivadas = false.
-- Se parchea por ancla para no reescribir la función.

do $m$
declare
  d text := pg_get_functiondef('public.pagos_resumen(text, bigint, text, text, text[], text, text, text, date, date, text[], boolean, boolean, text, boolean, bigint, boolean, bigint[])'::regprocedure);
  a text := '       and (coalesce(p_archivadas, false) or not coalesce(v.todas_archivadas, false))';
  n text := '       and true  -- p_archivadas ya no filtra: las obras archivadas no esconden facturas (20261008e)';
begin
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then
    raise exception 'ANCLA_ARCHIVADAS: se esperaba exactamente una vez';
  end if;
  execute replace(d, a, n);
end $m$;
