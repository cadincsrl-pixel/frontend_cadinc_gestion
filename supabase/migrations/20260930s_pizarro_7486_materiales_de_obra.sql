-- Dueño, 25/09: los aires de Pizarro (FA A 00012-00007486) van como «Materiales de obra», el
-- concepto que ya existía; no hace falta uno aparte. Se da de baja «Mercadería para reventa»
-- (creado en 20260930q, sin otro uso). El reparto (100% CC GERENCIA) y el pago no cambian.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_mat bigint := (select id from public.pagos_conceptos where nombre = 'Materiales de obra');
  v_rev bigint := (select id from public.pagos_conceptos where nombre = 'Mercadería para reventa');
begin
  update public.pagos_facturas set concepto_id = v_mat, updated_by = v_user where id = 678;
  update public.pagos_conceptos set activo = false, updated_by = v_user, updated_at = now()
   where id = v_rev and not exists (select 1 from public.pagos_facturas where concepto_id = v_rev);
end
$m$;
