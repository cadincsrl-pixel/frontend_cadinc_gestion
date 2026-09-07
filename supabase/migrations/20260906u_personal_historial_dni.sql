-- 20260906u — Personal: historial de categorías sin ruido, DNI normalizado.
--
-- Hasta hoy el backend insertaba una fila en personal_cat_historial en CADA
-- edición del trabajador (teléfono, talles…) aunque la categoría no cambiara:
-- 453 filas para 116 cambios reales. Las filas repetidas no alteran ningún
-- cálculo (getCatIdEfectivo toma la última con desde <= fecha, así que una
-- fila que repite la categoría anterior nunca cambia el resultado) y se
-- pueden borrar sin mover un peso. De ahora en más el service solo escribe
-- cuando cambia la categoría y hay una sola fila por legajo y viernes.

-- 1a) Mismo legajo y misma fecha: queda la última decisión (id mayor).
delete from public.personal_cat_historial h
using public.personal_cat_historial h2
where h.leg = h2.leg and h.desde = h2.desde and h.id < h2.id;

-- 1b) Filas que repiten la categoría de la fila anterior del mismo legajo.
delete from public.personal_cat_historial
where id in (
  select id from (
    select id, cat_id, lag(cat_id) over (partition by leg order by desde, id) as prev
    from public.personal_cat_historial
  ) s
  where cat_id = prev
);

-- 1c) Una sola fila por legajo y fecha (el service corrige en vez de duplicar).
create unique index if not exists personal_cat_historial_leg_desde_uidx
  on public.personal_cat_historial (leg, desde);

-- 2) DNI solo dígitos (había "36.890.735") y nombres sin espacios sobrantes.
update public.personal set dni = regexp_replace(dni, '\D', '', 'g') where dni ~ '\D';
update public.personal set nom = btrim(nom) where nom <> btrim(nom);

alter table public.personal
  add constraint personal_dni_formato_check
  check (dni is null or dni = '' or dni ~ '^[0-9]{7,8}$');

-- Pendiente (decisión del user): índice único sobre dni. Hoy hay 2 DNIs
-- repetidos reales (legajos 009/089 y 011/091); cuando se corrijan:
--   create unique index personal_dni_uidx on public.personal (dni) where dni <> '';
