-- "No es un operario" deja de disfrazarse de "ya no trabaja acá".
--
-- El 07/09 se marcaron cuatro legajos con activo_override = false porque en
-- realidad son gente de otro padrón: Zelarayán es chofer de logística, y
-- Corral, Valdez y Fernández son de oficina (su sueldo vive en
-- `oficina_personal` / `oficina_sueldos`). Pero `activo_override = false`
-- significa "este OPERARIO ya no trabaja", que es otra cosa.
--
-- Consecuencia: sacarlos de la lista de activos los metió en la alerta
-- siguiente ("inactivos con cobertura activa"), que afirma algo falso —
-- Alina y Bautista sí trabajan, y su cobertura está bien pagada, solo que se
-- rinde por Costos de oficina. Con un solo campo para dos hechos distintos,
-- cada alerta nueva que se apoye en `personal` los vuelve a levantar.
--
-- `padron_externo` dice DÓNDE vive la ficha real de esa persona. NULL = es un
-- operario de obra de verdad (106 de los 110 legajos).
alter table public.personal
  add column if not exists padron_externo text;

alter table public.personal
  drop constraint if exists personal_padron_externo_chk;

alter table public.personal
  add constraint personal_padron_externo_chk
  check (padron_externo is null or padron_externo in ('oficina','chofer','contratista'));

comment on column public.personal.padron_externo is
  'NULL = operario de obra. Si tiene valor, la ficha real de la persona vive en otro padron (oficina_personal, choferes o contratistas) y este legajo existe solo por su historia. Las pantallas de operarios lo filtran; NO usar activo_override para esto.';

create index if not exists personal_padron_externo_idx
  on public.personal (padron_externo) where padron_externo is not null;

update public.personal set padron_externo = 'chofer'  where leg = '081';
update public.personal set padron_externo = 'oficina' where leg in ('085','086','087');

-- El activo_override = false se DEJA puesto, aunque ahora sea redundante.
-- Es a propósito: una pantalla que todavía no conozca la columna nueva los va
-- a mostrar como inactivos (ruido menor) en vez de como operarios activos
-- (que sería peor que lo que teníamos).
