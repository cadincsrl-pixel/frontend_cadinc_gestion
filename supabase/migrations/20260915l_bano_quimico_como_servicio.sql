-- Baño químico, el cuarto servicio
--
-- El user enumeró lo que necesita: "flete, contenedor, corte y plegado, baño
-- quimico etc". Los tres primeros salieron en 20260915k; este faltaba.
--
-- Nunca se pidió en texto libre y no existía ninguna ficha parecida (verificado
-- contra nombre y alias: sólo aparecen "Pileta baño", "Grifería baño",
-- "Extractor p/ baño" y "Barral p/ baño accesible", que son materiales).
--
-- Sin precio de referencia, como los otros tres: lo pone la factura del alquiler.
--
-- OJO CON EL ALIAS: "quimico" suelto choca con la ficha 695 "Sikadur 31
-- (adhesivo epoxi)", que lleva "anclaje quimico" de sinónimo — dos productos que
-- no tienen nada que ver. Por eso los siete alias llevan "baño" o "sanitario"
-- adelante. Verificado: 0 colisiones.
--
-- Y EL "ETC" DEL USER ES LO QUE IMPORTA: con este van cuatro, y va a haber más.
-- Por eso en el mismo commit va el interruptor "Es un servicio" en el alta
-- rápida del pedido, para que las próximas las pueda crear él sin pedir una
-- migración. Ahí el rubro, la unidad y el precio se acomodan solos.

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
select r.id, 'Alquiler de baño químico (servicio)', 'unid', 'servicio', true, false, 0, 0, 0,
  array['bano quimico','baño quimico','banos quimicos','baños quimicos','alquiler de bano quimico','sanitario portatil','bano portatil'],
  'Alta 15/09/2026 (20260915l). Servicio: entra a la cuenta de la obra y respeta a cargo de cliente o CADINC, pero no tiene stock ni pasa por el deposito. Sin precio de referencia: lo pone la factura del alquiler.'
from stock_rubros r where lower(r.nombre) = 'servicios'
  and not exists (select 1 from stock_materiales where nombre = 'Alquiler de baño químico (servicio)');
