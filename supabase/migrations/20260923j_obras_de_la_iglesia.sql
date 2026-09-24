-- =====================================================================
-- Cuatro obras más de la Iglesia de Jesucristo de los Santos de los Últimos
-- Días (2026-09-23)
--
-- El dueño: «las 4 primeras son de la Iglesia». Tenían en `obras.cc` su
-- propio nombre (CONCEPCION CAPILLA, CONCEPCION PL, Neuquen capilla,
-- OFICINA MISION SALTA), por eso `20260923h` no las vinculó. Aplicado por SQL
-- el mismo día; este archivo lo deja escrito. Idempotente.
-- =====================================================================

update public.obras o set cliente_id = c.id
  from public.ventas_clientes c
 where c.doc_tipo = 80 and c.doc_nro = '30544857815' and c.activo
   and o.cod in ('CC-017', 'CC-018', 'CC-033', 'CC-022')
   and o.cliente_id is null
   and not coalesce(o.es_interna, false);
