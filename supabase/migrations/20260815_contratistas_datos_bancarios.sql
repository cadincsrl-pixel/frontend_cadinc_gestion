-- Datos bancarios del contratista (para pagarle las certificaciones por
-- transferencia): cuenta, CBU, alias y titular. El CUIT ya existía como
-- columna propia.
alter table public.contratistas
  add column if not exists banco_cuenta   text,
  add column if not exists cbu            text,
  add column if not exists alias_cbu      text,
  add column if not exists titular_cuenta text;
