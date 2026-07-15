-- Categorías de unidades + tarifa por tipo de unidad.
-- Caso que lo motiva: Paramérica paga distinto el mismo recorrido
-- (Ingenio San Isidro → TPR) según si el viaje lo hace un tractor con
-- batea o un camión chasis.

-- Camiones: tractor (arrastra batea/semirremolque) o chasis (caja fija).
alter table camiones
  add column categoria text not null default 'tractor'
  check (categoria in ('tractor', 'chasis'));

-- Bateas: categoría de remolque (aparte de `tipo` volcadora/plana, que
-- describe la forma). batea / acoplado / semirremolque.
alter table bateas
  add column categoria text not null default 'batea'
  check (categoria in ('batea', 'acoplado', 'semirremolque'));

-- Tarifa por tipo de unidad: null = vale para cualquier unidad (general).
-- Resolución en el frontend: depósito+unidad > depósito > unidad > general.
alter table tarifas_empresa_cantera
  add column tipo_unidad text
  check (tipo_unidad in ('batea', 'chasis'));

-- Data: AA384MR es el chasis de la flota; XBM836 (la plana) es su acoplado
-- (confirmado por el user 2026-07-15).
update camiones set categoria = 'chasis' where patente = 'AA384MR';
update bateas set categoria = 'acoplado' where patente = 'XBM836';

-- Tarifa chasis de Paramérica Ingenio San Isidro → TPR: $85.000 + IVA =
-- $102.850 final (las tarifas se cargan con IVA incluido). Espeja el par
-- cantera/depósito y la vigencia de la tarifa batea existente (id 19).
insert into tarifas_empresa_cantera (empresa_id, cantera_id, deposito_id, valor_ton, vigente_desde, obs, tipo_unidad)
select empresa_id, cantera_id, deposito_id, 102850, vigente_desde, 'Tarifa chasis ($85.000 + IVA)', 'chasis'
from tarifas_empresa_cantera where id = 19;
