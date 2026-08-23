-- Regla de negocio (2026-08-23): peajes y gomería son gastos que ya
-- ocurrieron — no se pueden cargar con fecha futura. Otras categorías sí
-- (previsión: seguros, patentes, etc.). Data-driven: flag en la categoría,
-- validación en el backend (gastos.service create/update).

alter table gastos_categorias
  add column if not exists permite_fecha_futura boolean not null default true;

comment on column gastos_categorias.permite_fecha_futura is
  'false = la categoría no admite gastos con fecha futura (ej. peaje, gomería: son hechos consumados). El backend valida en create/update.';

update gastos_categorias
  set permite_fecha_futura = false
  where codigo in ('peaje', 'gomeria');
