-- Cierre de la familia Patroll (línea amarilla de Aliafor), con el catálogo oficial que
-- mandó el user el 14/09.
--
-- 1) LAS TRES FOTOS DEL MISMO SET PASAN A PRINCIPALES. El turbo 115 y el continuo 115 ya
--    tenían foto (de avisos de comercio), y el segmentado no tenía ninguna. Ahora las tres
--    salen de la misma toma del catálogo del fabricante, así que puestas una al lado de la
--    otra **la única diferencia visible es el filo**, que es exactamente lo que las separa:
--      continuo  (PYC) → filo liso y entero
--      turbo     (PYT) → dientes inclinados corridos + agujeros de refrigeración
--      segmentado(PYS) → cortes profundos que parten el filo en tacos
--    Las fotos viejas quedan como segunda de cada ficha, no se borran.
--
-- 2) LOS CÓDIGOS DE LÍNEA COMO SINÓNIMO. PYC/PYS/PYT es la forma dura de distinguirlas,
--    igual que el código de lista de 4 dígitos en el resto del catálogo: el nombre se puede
--    escribir de diez maneras, el código no. El de 180 ya se había cargado como PYT-7.
--
-- 3) RECUENTO: el continuo queda en CERO por indicación del user. Estaba en -2, producto de
--    dos salidas sin ninguna entrada, así que el ajuste es +2 (el ajuste es un DELTA sobre
--    el saldo, no el número contado). `stock_actual` es cache sin trigger: se recalcula.

update public.stock_material_fotos f
   set orden = case when f.descripcion like '%catálogo oficial de la línea%' then 0 else 1 end
 where f.material_id in (859, 2648) and f.deleted_at is null;

update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(alias || array['pyc','patroll pyc','disco pyc']) a)
 where id = 859;
update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(alias || array['pys','patroll pys','disco pys']) a)
 where id = 2647;
update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(alias || array['pyt','patroll pyt','disco pyt']) a)
 where id = 2648;
update public.stock_materiales
   set alias = (select array_agg(distinct a order by a) from unnest(alias || array['pys','patroll pys','pys 7']) a)
 where id = 2649;

insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, fecha, estado, obs, created_by)
values (859, 'ajuste', 2, 'ajuste_inventario', date '2026-09-14', 'aprobado',
        'Recuento de Sosa del 14/09: del continuo no hay ninguno. La ficha figuraba en -2 por dos salidas sin entrada, así que el ajuste es +2 para dejarla en 0.',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

update public.stock_materiales m
   set stock_actual = coalesce((
        select sum(case sm.tipo when 'entrada' then sm.cantidad
                               when 'salida'  then -sm.cantidad
                               when 'ajuste'  then sm.cantidad end)
          from public.stock_movimientos sm
         where sm.material_id = m.id and coalesce(sm.estado,'aprobado') <> 'rechazado'), 0)
 where m.id = 859;

do $$
declare v numeric; n integer;
begin
  select stock_actual into v from public.stock_materiales where id = 859;
  if v <> 0 then raise exception 'El continuo quedó en % y tenía que quedar en 0', v; end if;
  select count(*) into n from public.stock_materiales m
    join public.stock_material_fotos f on f.url = m.foto_url and f.deleted_at is null
   where m.id in (859, 2647, 2648) and f.descripcion like '%catálogo oficial de la línea%';
  if n <> 3 then raise exception 'Sólo % de las 3 fichas Patroll quedó con la foto del set oficial como principal', n; end if;
end $$;
