-- =====================================================================
-- Pagos: el «centro de costo» agrupado sale del cliente de la obra, no de
-- obras.cc (2026-09-23)
--
-- Decisión del dueño: «cada nombre de obra es un centro de costo; si
-- distintas obras son del mismo cliente, sirve para ver cuánto en total».
-- `obras.cc` era el nombre del cliente tipeado a mano, con errores (CC PODA,
-- interna, figuraba como «IGLESIAS»). Ahora el agrupado usa
-- `obras.cliente_id` → `ventas_clientes.razon_social`.
--
-- Pagos sigue sin cruzarse con otros módulos (§5.18): el cliente es un dato
-- DE LA OBRA, que es lo único que comparte.
--
-- `_pagos_centro_de` no cambia: interna o depósito → nombre de la obra; si no,
-- el cliente, y sin cliente, el nombre de la obra. Lo que cambia es lo que se
-- le pasa: en las tres llamadas (`v_pagos_facturas` ×3, `pagos_resumen`,
-- `pagos_ordenes_resumen`) `o.cc` pasa a ser la razón social del cliente.
-- Se reescribe cada definición tal como está viva, reemplazando sólo esa
-- expresión, y se verifica que el reemplazo haya ocurrido las veces justas.
--
-- Efecto al 23/09 (las facturas cargadas son de obras sin cliente): «ARIDOS
-- CADINC» → «ARIDOS», «CC CADINC-HOTEL» → «HOTEL», «Neuquen capilla» →
-- «Neuquen». El resto igual.
-- =====================================================================

do $$
declare
  viejo text := '_pagos_centro_de(o.cc,';
  nuevo text := '_pagos_centro_de((select vc.razon_social from public.ventas_clientes vc where vc.id = o.cliente_id),';
  d text; n int; r text;
begin
  d := pg_get_viewdef('public.v_pagos_facturas'::regclass, true);
  n := (length(d) - length(replace(d, viejo, ''))) / length(viejo);
  if n <> 3 then raise exception 'v_pagos_facturas: esperaba 3 llamadas, hay %', n; end if;
  execute 'create or replace view public.v_pagos_facturas as ' || replace(d, viejo, nuevo);

  foreach r in array array['public.pagos_resumen', 'public.pagos_ordenes_resumen'] loop
    d := pg_get_functiondef(r::regproc);
    n := (length(d) - length(replace(d, viejo, ''))) / length(viejo);
    if n <> 1 then raise exception '%: esperaba 1 llamada, hay %', r, n; end if;
    execute replace(d, viejo, nuevo);
  end loop;
end $$;
