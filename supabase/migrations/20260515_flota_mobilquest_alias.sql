-- Flota CADINC — Alias del catálogo de MobilQuest.
-- En MQ cada vehículo tiene un alias descriptivo (ej. "STRADA", "DOBLE NUEVA",
-- "HIDROGRUA", "Gerencia") que es más útil que el modelo del chasis para
-- identificarlo en operación. Lo guardamos en una columna y lo sincronizamos
-- con el catálogo en cada corrida de GPS sync.

alter table public.flota_vehiculos
  add column if not exists mobilquest_alias text;
