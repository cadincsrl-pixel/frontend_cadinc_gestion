-- 20260923d — Recuento de los discos diamantados Patroll de 115mm (user 2026-09-23)
--
-- El user contó en el depósito: continuo 0, segmentado 23, turbo 22.
-- Los tres ajustes van `aprobado` (los carga el admin, igual que el recuento
-- del 14/09). `cantidad` es el DELTA firmado contra el saldo del sistema.
--
--   C0859 continuo    sistema -7 → 0   (+7)  desde el recuento del 14/09
--                                            estaba en 0 y hoy salieron 7.
--   C2647 segmentado  sistema  0 → 23  (+23) nunca se cargó una entrada.
--   C2648 turbo       sistema 43 → 22  (-21)
--
-- Sospecha (no se corrige acá): los 7 discos que salieron hoy como "continuo"
-- (CC-004 x5, CC-035 x2) probablemente eran turbo o segmentado, que es lo que
-- hay. Si es así, esas obras tienen en la cuenta un continuo a $13.925.
--
-- stock_actual es un cache sin trigger (CLAUDE.md §5.15): se recalcula acá.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by, aprobado_por, aprobado_at)
select v.material_id, 'ajuste', v.delta, 'ajuste_inventario', v.sub_motivo, 'aprobado',
       '2026-09-23', v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', now()
from (values
  (859,    7, 'error_carga',     'Recuento del 23/09: del continuo de 115 no hay ninguno. La ficha figuraba en -7 por los despachos de hoy (CC-004 x5, CC-035 x2) sin entrada.'),
  (2647,  23, 'error_carga',     'Recuento del 23/09: 23 discos segmentados de 115. La ficha estaba en 0 y sin movimientos: entraron sin cargarse.'),
  (2648, -21, 'faltante_fisico', 'Recuento del 23/09: 22 discos turbo de 115; el sistema decía 43.')
) as v(material_id, delta, sub_motivo, obs);

update public.stock_materiales m
   set stock_actual = coalesce((
         select sum(case when s.tipo = 'salida' then -s.cantidad else s.cantidad end)
           from public.stock_movimientos s
          where s.material_id = m.id and s.estado = 'aprobado'), 0)
 where m.id in (859, 2647, 2648);
