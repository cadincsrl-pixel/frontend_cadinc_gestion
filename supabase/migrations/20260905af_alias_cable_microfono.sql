-- 20260905af — Más sinónimos para "Cable p/ micrófono balanceado 6mm (XLR)" (user 2026-09-05)
update public.stock_materiales
   set alias = array(select distinct unnest(coalesce(alias,'{}') || array[
     'cable para microfono','cable p/ microfono','cable de mic','cable canon','cable canon xlr','cable xlr macho hembra',
     'cable microfono balanceado','cable microfono mallado','cable mallado de audio','cable de señal de audio','cable de senal',
     'cable audio microfono','cable microfono 6mm','cable venetian','cable microfono xlr','cable para consola','cable de consola',
     'cable microfono por metro','metro de cable microfono','rollo cable mic']))
 where nombre = 'Cable p/ micrófono balanceado 6mm (XLR)';
