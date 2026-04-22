-- =====================================================================
-- Tramos: orden manual dentro del mismo día (tiebreaker reordenable)
-- =====================================================================
-- orden_dia se usa como desempate en el ORDER BY; se inicializa con id
-- para preservar el orden existente.

alter table tramos
  add column if not exists orden_dia bigint;

update tramos
   set orden_dia = id
 where orden_dia is null;

create index if not exists idx_tramos_orden_dia on tramos(fecha_operacion desc, orden_dia desc);
