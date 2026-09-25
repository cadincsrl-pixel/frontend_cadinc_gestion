-- =====================================================================
-- Logística › Rentabilidad: el viaje puede volver cargado
-- (2026-09-25, serie 20260929)
--
-- Pedido del dueño: «a veces cargamos la ida y la vuelta distintas cosas,
-- con distintas toneladas y distintas tarifas». Hasta hoy un viaje tenía UNA
-- carga (toneladas × tarifa, con su comisión) para los km totales, o sea que
-- la vuelta se suponía vacía.
--
-- Columnas nuevas (la ida sigue siendo toneladas / tarifa_neta_por_ton /
-- comision_pct):
--   · carga_ida, carga_vuelta: qué lleva (texto libre, para leer la lista).
--   · vuelve_cargado: si es false, lo de la vuelta no cuenta aunque tenga datos.
--   · toneladas_vuelta, tarifa_vuelta_por_ton, comision_vuelta_pct: la carga de
--     vuelta, con sus propias reglas (la comisión es de su propio dador).
-- El cálculo (lib/utils/rentabilidad.ts) suma los dos ingresos; los km, el
-- gasoil, los peajes y el jornal no cambian (ya eran de ida + vuelta).
-- =====================================================================

alter table public.rentabilidad_viajes
  add column carga_ida             text,
  add column vuelve_cargado        boolean       not null default false,
  add column carga_vuelta          text,
  add column toneladas_vuelta      numeric(12,2) not null default 0 check (toneladas_vuelta >= 0),
  add column tarifa_vuelta_por_ton numeric(14,2) not null default 0 check (tarifa_vuelta_por_ton >= 0),
  add column comision_vuelta_pct   numeric(5,2)  not null default 0 check (comision_vuelta_pct >= 0 and comision_vuelta_pct < 100);

comment on column public.rentabilidad_viajes.vuelve_cargado is
  'El camión vuelve con carga: suma el ingreso de toneladas_vuelta × tarifa_vuelta_por_ton (menos su comisión). 20260929v.';
