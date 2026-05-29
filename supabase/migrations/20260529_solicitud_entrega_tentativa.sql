-- Fecha y hora tentativa de entrega de la solicitud de compra.
-- Es lo que el solicitante espera/quiere como momento de entrega del material.
--
-- timestamp WITHOUT time zone a propósito: el sistema es mono-región
-- (Argentina) y el input del front es <datetime-local> ("YYYY-MM-DDTHH:mm").
-- Guardar sin tz = lo que se carga es lo que se ve, sin conversiones que
-- desplacen la hora. Nullable: no toda solicitud define una fecha de entrega.

ALTER TABLE public.solicitud_compra
  ADD COLUMN entrega_tentativa timestamp;
