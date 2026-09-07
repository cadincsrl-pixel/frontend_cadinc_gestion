-- 20260907d — Tarifa de obra con vh NULL = "volver al precio global".
--
-- "Volver al global" en el panel de tarifas copiaba el global vigente como
-- una tarifa más de la obra: cuando el global subía, esa obra quedaba
-- pinneada en el precio viejo. Ahora una fila con vh NULL desde un viernes
-- significa que desde esa semana rige el precio global de la categoría
-- (getVHConCatObra en el front y vhConCatObra en el backend la tratan como
-- "sin tarifa de obra").
alter table public.tarifas alter column vh drop not null;
alter table public.tarifas add constraint tarifas_vh_check check (vh is null or vh >= 0);
comment on column public.tarifas.vh is
  'Precio por hora de la obra para la categoría desde `desde`. NULL = desde ese viernes vuelve a regir el precio global.';
