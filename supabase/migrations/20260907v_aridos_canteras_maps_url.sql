-- Ubicación de las canteras de áridos: mismo mecanismo que las de logística.
--
-- `aridos_canteras` YA tenía `lat` y `lng`, y la lista de la pantalla ya pinta
-- el pin 📍 cuando están cargadas. Lo que faltaba era la forma de cargarlas:
-- el service solo las derivaba geocodificando la dirección (best-effort), que
-- suele caer en el centro del pueblo y no en la planta.
--
-- Logística resuelve esto guardando el LINK de Google Maps y sacando el punto
-- exacto del pin (`canteras.maps_url`). Se replica acá el mismo campo para que
-- las dos pantallas usen el mismo componente y el mismo dato.
--
-- Solo agrega una columna nullable: no toca ninguna fila existente.

alter table public.aridos_canteras
  add column if not exists maps_url text;

comment on column public.aridos_canteras.maps_url is
  'Link de Google Maps de la cantera. El backend saca lat/lng del pin de este link (POST /api/logistica/maps/resolver-url). Espejo de canteras.maps_url de logística.';
