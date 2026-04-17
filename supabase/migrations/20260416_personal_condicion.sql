-- Agrega columna condicion a personal
alter table personal
  add column if not exists condicion text
    check (condicion in ('blanco', 'asegurado'));
