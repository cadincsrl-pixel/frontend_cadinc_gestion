-- El selector de obras de la bandeja se armaba trayendo UNA FILA POR ENTREGA y
-- agregando en JS. PostgREST capea la respuesta en 1000 filas EN SILENCIO (§5.7),
-- asi que con el ledger creciendo ~100/mes el filtro iba a empezar a ofrecer un
-- subconjunto arbitrario de obras alrededor de abril 2027 — el mismo bug que se
-- acababa de arreglar un nivel mas arriba (la lista armada con la pagina
-- actual), pero invisible, porque ahora parece venir del server.
--
-- La agregacion va en una VISTA: una fila por obra (~31 hoy), imposible de
-- recortar por muchas entregas que haya.

create or replace view public.v_herr_entregas_obras
with (security_invoker = true) as
select e.obra_cod                                    as cod,
       count(*)                                      as n,
       count(*) filter (where e.estado = 'pendiente') as n_pendientes,
       max(e.fecha)                                  as ultima
  from public.herr_entregas e
 where e.obra_cod is not null
   and e.estado <> 'anulada'
 group by e.obra_cod;

comment on view public.v_herr_entregas_obras is
  'Obras con salidas al panol, agregadas en el server. Existe para que el selector de la bandeja no traiga una fila por entrega y choque contra el techo de 1000 de PostgREST.';
