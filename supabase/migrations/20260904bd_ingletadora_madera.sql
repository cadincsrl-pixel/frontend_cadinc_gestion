-- 20260904bd — La ingletadora es para madera; la sensitiva, para metal (user 2026-09-04)
update public.stock_materiales
   set nombre = 'Sierra ingletadora (madera)',
       alias = array(select distinct unnest(alias || array['ingletadora de madera','sierra de inglete para madera','ingletadora madera','sierra ingletadora madera'])),
       obs = coalesce(obs || ' · ', '') || 'Para madera; el corte de metal es la sierra sensitiva.'
 where nombre = 'Sierra ingletadora';
