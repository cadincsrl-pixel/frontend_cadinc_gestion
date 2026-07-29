-- Marca "propio / de tercero" en camiones y choferes.
--
-- CADINC le lleva la facturación a fleteros que no son de la empresa: cobra el
-- flete al cliente y le paga al fletero, pero el camión no es suyo y el gasoil,
-- las cubiertas y el service los pone él. Hoy Chavez Roque Luis (chofer 9) con
-- el camión AA384MR (id 6) es el único caso.
--
-- Mezclados en Gastos > Reportes distorsionan todo, porque son dos negocios
-- distintos: el camión propio deja margen después de gasoil, cubiertas, service
-- y mano de obra; el fletero deja margen después de lo que se le paga y nada
-- más. Los 4 viajes de Roque entraban a la facturación **sin ningún costo del
-- otro lado** — ni gastos (su camión tiene 0) ni mano de obra (no tiene ninguna
-- liquidación) — o sea que figuraban con margen del 100% e inflaban el margen
-- general. Decisión del dueño el 2026-07-29: fuera del reporte, "no hacen a la
-- flota".
--
-- La marca va en las DOS tablas a propósito. Hoy la relación es 1:1 y limpia
-- (los 6 tramos de Roque son con el camión 6 y ningún otro chofer lo usó), pero
-- un fletero puede cambiar de camión, o un chofer de CADINC puede cubrirle un
-- viaje. Con las dos marcas el reporte excluye si CUALQUIERA de las dos partes
-- es de tercero, sin depender de que la otra esté bien cargada.
--
-- `default true` es deliberado: lo normal es que sea propio, así que lo que ya
-- está cargado y lo que se cargue de acá en adelante queda bien sin tocar nada.
-- Lo excepcional se marca a mano.

alter table public.camiones
  add column if not exists es_propio boolean not null default true;

alter table public.choferes
  add column if not exists es_propio boolean not null default true;

comment on column public.camiones.es_propio is
  'false = camión de un fletero: CADINC le factura el viaje pero no pone los gastos ni es dueña del equipo. Excluido de Gastos > Reportes.';

comment on column public.choferes.es_propio is
  'false = fletero externo: no está en la nómina de CADINC. Excluido de Gastos > Reportes.';

-- El caso concreto que motivó la marca. Por patente y por nombre, no por id,
-- para que la migración sea legible y no dependa de la secuencia.
update public.camiones set es_propio = false where patente = 'AA384MR';
update public.choferes set es_propio = false where nombre  = 'CHAVEZ, ROQUE LUIS';
