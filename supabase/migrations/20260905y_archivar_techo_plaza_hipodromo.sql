-- 20260905y — Se archivan Techo Farmacia Plaza (CC-008) e Hipódromo (CC-019) (pedido del user 2026-09-05)
-- Solo el archivo: las herramientas que figuran en obra y los materiales sin
-- cobrar quedan como están hasta que el user diga qué volvió y qué se cobra.

update public.obras
   set archivada = true, fecha_archivo = current_date,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod in ('CC-008', 'CC-019') and coalesce(archivada, false) = false;
