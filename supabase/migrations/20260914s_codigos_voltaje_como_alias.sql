-- Códigos del proveedor Voltaje cargados como sinónimo, a partir de la revisión del user
-- del 14/09 sobre los 31 renglones que el cotejo no pudo emparejar solo.
--
-- POR QUÉ IMPORTA: el catálogo empareja por nombre, y la planilla del proveedor escribe
-- en su propia nomenclatura ("PUNTERA HUECA TUBULAR AISL. 1 COND. CTN 4" contra
-- "Terminal puntera p/ cable 4mm²", "UNION PVC 7/8" contra "Cupla p/ caño rígido 7/8"").
-- El código es la única identidad estable. Con esto la próxima planilla de Nicolás se
-- cruza sola en vez de depender de que los nombres se parezcan.
--
-- SE DEJÓ AFUERA EL CÓDIGO `25c` A PROPÓSITO. Es de tres caracteres y el buscador del
-- pedido usa coincidencia por substring (CLAUDE.md §5.15): ya aparece dentro de seis
-- fichas activas — precinto de 25cm, sellador x 125cc, solución x 125cc — así que como
-- alias contaminaría esas búsquedas. Los otros 18 códigos se verificaron uno por uno
-- contra el catálogo y no chocan con nada. El cable celeste de 2,5 queda igual
-- identificado por `25ck` y `b25c`, que sí son específicos.
--
-- Las cuatro punteras las confirmó el user ("las punteras sí las tenemos cargadas"); dos
-- de ellas ya traían el texto del proveedor como alias de una tanda anterior, lo que
-- confirma que el camino es éste.

update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['04024']) a) where id = 44;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['jabalina 1/2 x 1.5 m c/tomacable']) a) where id = 66;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['s3x6']) a) where id = 235;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['cc100x50k']) a) where id = 745;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['cablecanal 32x12 mm c/adhesivo x 2 mts','cablecanal 32x12 schneider']) a) where id = 753;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['puntera hueca tubular 1 cond 2.5','puntera hueca tubular aisl. 1 cond. ctn 2.5']) a) where id = 907;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['puntera hueca tubular 2 cond 2.5','puntera hueca tubular aisl. 2 cond. ng ctd 2.5']) a) where id = 1220;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['union pvc 7/8','union pvc 7/8 - 22 mm','union rigido 7/8']) a) where id = 938;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['kronchng-ilu']) a) where id = 968;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['12360']) a) where id = 1351;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['k2t']) a) where id = 1369;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['k20a']) a) where id = 1377;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['abb2x16']) a) where id = 1408;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['abb2x10']) a) where id = 1439;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['15rk','b15r']) a) where id = 1576;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['25r','25rk','b25r']) a) where id = 1577;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['25ck','b25c']) a) where id = 1581;
update public.stock_materiales set alias = (select array_agg(distinct a order by a)
  from unnest(alias || array['25vak','b25va']) a) where id = 1585;

do $$
declare n int;
begin
  select count(*) into n from public.stock_materiales
   where id in (44,66,235,745,753,907,938,968,1220,1351,1369,1377,1408,1439,1576,1577,1581,1585);
  if n <> 18 then raise exception 'Esperaba tocar 18 fichas y encontré %', n; end if;
  if exists (select 1 from public.stock_materiales m, unnest(m.alias) a
              where m.id = 1581 and trim(a) = '25c') then
    raise exception 'El alias 25c entró en la ficha 1581 y no debía';
  end if;
end $$;
