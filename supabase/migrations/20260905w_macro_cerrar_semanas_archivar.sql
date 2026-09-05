-- 20260905w — Macro Urquiza (CC MACRO): se cierran las 9 semanas con horas sin cierre y se archiva la obra
--
-- OK del user 2026-09-05 ("cerrá esas semanas; que haya personas asignadas no
-- tiene nada que ver; los materiales dejalos en cero"). El cierre es la marca
-- de semana consolidada (misma fila que crea `cierresService.create` con
-- estado 'cerrado'); no recalcula nada. Semanas (viernes): 27/03, 03/04,
-- 10/04, 24/04, 01/05, 08/05, 15/05, 22/05 y 29/05. Las asignaciones y los
-- 3 renglones de materiales en $0 quedan como están.

insert into public.cierres (obra_cod, sem_key, estado, cerrado_en, created_by, updated_by)
select 'CC MACRO', v.sem_key, 'cerrado', now(), 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values ('2026-03-27'::date), ('2026-04-03'), ('2026-04-10'), ('2026-04-24'), ('2026-05-01'), ('2026-05-08'), ('2026-05-15'), ('2026-05-22'), ('2026-05-29')) as v(sem_key)
where not exists (select 1 from public.cierres c where c.obra_cod = 'CC MACRO' and c.sem_key = v.sem_key);

update public.cierres
   set estado = 'cerrado', cerrado_en = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where obra_cod = 'CC MACRO' and estado <> 'cerrado';

update public.obras
   set archivada = true, fecha_archivo = current_date,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod = 'CC MACRO' and coalesce(archivada, false) = false;
