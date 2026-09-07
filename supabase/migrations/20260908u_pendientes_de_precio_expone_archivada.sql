-- 20260908o — La vista de pendientes de precio expone si la obra esta archivada
-- (user 2026-09-07: "¿por que me marca que obras archivadas tienen renglones
-- sin precio?")
--
-- La alerta naranja de arriba de la cuenta corriente sale de esta vista, que
-- agrupaba por obra_cod y nada mas. Sin la columna, el backend NO PODIA
-- distinguir una obra cerrada aunque quisiera -- y de hecho no lo intentaba:
-- `getRenglones()` filtra con `eq('obra_archivada', false)` pero
-- `pendientesDePrecio()` no filtraba nada.
--
-- Hoy son 606 renglones en 32 obras, y 148 de ellos estan en 7 obras
-- ARCHIVADAS. No se esconden: el trabajo existe y al hacer clic en el chip se
-- llega (porque con `obra_cod` puesto el backend saltea el filtro). Lo que
-- faltaba era DECIRLO, para que el numero grande no prometa mas de lo que el
-- listado por defecto muestra.
--
-- Se mantiene `security_invoker=true` como estaba.
drop view if exists public.v_cuenta_cliente_pendientes;

create view public.v_cuenta_cliente_pendientes
with (security_invoker = true) as
select m.obra_cod,
       count(*)::integer            as sin_precio,
       coalesce(o.archivada, false) as obra_archivada
from public.materiales_a_cuenta_cliente m
left join public.obras o on o.cod = m.obra_cod
where m.precio_unit = 0::numeric
group by m.obra_cod, coalesce(o.archivada, false);

grant select on public.v_cuenta_cliente_pendientes to anon, authenticated, service_role;
