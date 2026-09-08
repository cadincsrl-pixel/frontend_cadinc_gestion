-- FARMACIA AMERICA + catálogo: el film SW fue rollo entero, y sus sinónimos
--
-- El user aclaró que a la obra se mandó el ROLLO ENTERO del film de
-- enmascarar Sherwin Williams (4x150m): el renglón estaba cobrado $7.850
-- (como si fuera una fracción) y pasa a $101.000, el precio real del rollo
-- (mcc 2515 / item 2690). Efecto: +$93.150.
--
-- Sinónimos de la ficha: se agrega "film protector" (es como lo llama el
-- user; convive con las fichas "Film protector 3x4m" y el washi Wells — el
-- buscador va a mostrar las tres y se elige) y se saca "film pintura", que
-- era genérico y no aportaba (el rubro Pintura ya matchea "pintura").

update materiales_a_cuenta_cliente
   set precio_unit = 101000, precio_total = 101000, updated_at = now()
 where id = 2515 and obra_cod = 'CC-023';

update solicitud_compra_item
   set precio_unit = 101000,
       obs = coalesce(obs || ' · ', '') ||
             'Rollo entero (150 m) enviado a la obra; precio ajustado el 08/09 por el user.'
 where id = 2690;

update stock_materiales
   set alias = (select array_agg(distinct a) from unnest(
                  array_remove(coalesce(alias, '{}'), 'film pintura')
                  || array['film protector', 'rollo de film protector']
                ) a)
 where nombre = 'Film nylon p/ enmascarar Sherwin Williams 4x150m';
