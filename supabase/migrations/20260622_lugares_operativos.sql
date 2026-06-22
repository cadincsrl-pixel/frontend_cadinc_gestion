-- Lugares operativos (no facturables).
--
-- CHIVILCOY (y futuros puntos similares) es un punto OPERATIVO: mantenimiento de
-- camiones, relevos/intercambios de choferes, dejar unidades. Se modeló como
-- cantera ("CHIVILCOY CANT") y como depósito ("CHIVILCOY") solo para poder cerrar
-- tramos vacíos de ruteo, pero NO es un origen/destino facturable: un tramo
-- `cargado` jamás debería originarse ni entregar en uno de estos lugares (saldría
-- en $0 porque no existe —ni debe existir— una tarifa).
--
-- Marcamos esos lugares con `operativo=true`. El frontend los oculta del selector
-- de cantera/depósito al crear un tramo `cargado` (siguen disponibles para vacíos)
-- y facturación los excluye; el backend rechaza un cargado con cantera/depósito
-- operativo (defensa en profundidad).

alter table public.canteras  add column if not exists operativo boolean not null default false;
alter table public.depositos add column if not exists operativo boolean not null default false;

-- Marcar CHIVILCOY existente (cantera "CHIVILCOY CANT" + depósito "CHIVILCOY").
update public.canteras  set operativo = true where nombre ilike '%chivilcoy%';
update public.depositos set operativo = true where nombre ilike '%chivilcoy%';
