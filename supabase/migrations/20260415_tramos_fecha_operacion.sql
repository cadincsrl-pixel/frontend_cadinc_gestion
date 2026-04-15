alter table tramos
  add column if not exists fecha_operacion date generated always as (
    coalesce(fecha_carga, fecha_vacio)
  ) stored;
