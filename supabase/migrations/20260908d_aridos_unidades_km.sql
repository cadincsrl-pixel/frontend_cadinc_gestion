-- Kilometraje de las unidades de áridos, para poder hacerles el service por km.
--
-- El GPS (Mobile Quest) YA devuelve el kilometraje: `DatosUltimosGPS.km`. Los
-- camiones de logística lo persisten en `camiones.km_actuales` desde el cron de
-- sync. Áridos llama al mismo cliente pero se queda solo con lat/lng/velocidad
-- y **tira el km**, así que hoy no hay contra qué comparar un service.
--
-- Mismas dos columnas que `camiones`, con el mismo criterio: el sync solo pisa
-- el valor si el km del GPS es MAYOR que el guardado (un GPS que reporta menos
-- es un reemplazo de equipo o una lectura sucia, no un camión que retrocedió).

alter table public.aridos_unidades
  add column if not exists km_actuales      numeric,
  add column if not exists km_actualizado_en timestamptz;

comment on column public.aridos_unidades.km_actuales is
  'Kilometraje del odometro segun el GPS. Lo escribe el sync de Mobile Quest, solo si es mayor al guardado. Es la base del semaforo de services.';
comment on column public.aridos_unidades.km_actualizado_en is
  'Cuando se actualizo km_actuales por ultima vez. Si esta viejo, el semaforo de services no es confiable.';

-- El sync recorre las unidades con equipo GPS asignado.
create index if not exists aridos_unidades_gps_idx
  on public.aridos_unidades (id_vehiculo_gps)
  where id_vehiculo_gps is not null;
