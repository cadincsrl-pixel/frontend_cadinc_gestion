-- Sosa pidió "ficha hembra 10 amp" en un pedido de depósito y el user avisó que la
-- marca que compran es Richi. Se suma el sinónimo para que quien busque por marca la
-- encuentre.
--
-- NO se renombra la ficha a "Richi". La lección del Awaduct (09/09) es que la marca
-- vale POR PEDIDO y no siempre: el user avisó entonces "todo lo 63, 32 y 50 de ESTE
-- pedido es Awaduct, no en todos". Renombrar reclamaría como Richi compras que quizás
-- no lo eran. Si en algún momento el precio empieza a depender de la marca, ahí sí se
-- parte en fichas por marca, como se hizo con las térmicas y los selladores PU.
--
-- Tampoco se usa "richi" a secas como alias: es de una sola palabra y matchearía las
-- dos fichas hermanas por substring (CLAUDE.md §5.15). Los alias llevan el producto.

update public.stock_materiales
   set alias = (select array_agg(distinct a order by a)
                  from unnest(alias || array['ficha macho richi','ficha macho 10a richi']) a)
 where id = 278;

update public.stock_materiales
   set alias = (select array_agg(distinct a order by a)
                  from unnest(alias || array['ficha hembra richi','ficha hembra 10a richi']) a)
 where id = 279;
