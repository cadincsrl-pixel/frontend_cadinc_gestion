-- 20260906e — La punta PH2 de ABC viene en blíster de 4 (user 2026-09-06): la referencia va por punta
update public.stock_materiales
   set precio_ref = 3270.33, precio_actualizado_en = now(),
       alias = array(select distinct unnest(coalesce(alias,'{}') || array['punta ph2','puntas ph2','punta phillips 2','punta doble ph2','blister puntas ph2'])),
       obs = coalesce(obs || ' · ', '') || 'POR PUNTA. ABC 07/08/2026: blíster x4 $10.811 neto → $13.081,31 final el blíster (antes se había cargado el blíster como una punta).'
 where id = 825;
