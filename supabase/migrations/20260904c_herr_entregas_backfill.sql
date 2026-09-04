-- Backfill: las 256 herramientas que ya salieron a obra antes de que existiera
-- el ledger. Decision del user (2026-09-03): la bandeja arranca LLENA, porque es
-- literalmente "la referencia de lo que se llevo" que pidio.
--
-- Reparto medido en prod: 4 por tilde manual + 41 por catalogo + 211 por texto,
-- sobre 159 descripciones distintas y 31 obras, 111 en los ultimos 30 dias.
--
-- Idempotente: saltea todo item que ya tenga una entrega viva. Se puede correr
-- de nuevo sin duplicar.
--
-- `es_backfill = true` para poder distinguir despues lo historico de lo que
-- entro solo por el trigger, sin mirar fechas.

insert into public.herr_entregas (
  item_id, solicitud_id, obra_cod, descripcion, descripcion_norm,
  cantidad, unidad, material_id, fecha, sentido, origen,
  es_backfill, estado, remito_envio_id, remito_numero
)
select i.id,
       i.solicitud_id,
       coalesce(r.obra_cod, s.obra_cod),
       i.descripcion,
       public.norm_txt(i.descripcion),
       i.cantidad_enviada,
       i.unidad,
       i.material_id,
       coalesce(i.fecha_envio, s.fecha, current_date),
       case when coalesce(i.devuelve, false) then 'devolucion' else 'salida' end,
       public.es_herramienta_item(i.clase, i.material_id, i.descripcion),
       true,
       'pendiente',
       i.remito_envio_id,
       r.numero
  from public.solicitud_compra_item i
  join public.solicitud_compra s on s.id = i.solicitud_id
  left join public.remitos_envio r on r.id = i.remito_envio_id
 where coalesce(i.cantidad_enviada, 0) > 0
   and public.es_herramienta_item(i.clase, i.material_id, i.descripcion) is not null
   and not exists (
     select 1 from public.herr_entregas e
      where e.item_id = i.id and e.estado <> 'anulada');
