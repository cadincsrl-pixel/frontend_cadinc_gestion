-- Completa 20260913i: enganchar la ficha en el renglón NO alcanza para el pañol.
--
-- Al ponerle la ficha nueva al renglón de la zaranda esperaba que
-- `trg_herr_entregas_sync` reacomodara la entrega. No lo hace, y mirando la
-- función se ve por qué: solo INSERTA una fila nueva cuando `cantidad_enviada`
-- supera lo ya registrado (`v_falta > 0`). Si la entrega ya existe, sale por
-- `return null` sin tocarla. Nunca actualiza el material_id de una fila vieja.
--
-- O sea que la nota de CLAUDE.md §5.12 —"tocar material_id = material_id para
-- que el pañol las tome"— sirve para renglones que TODAVÍA NO entraron al
-- pañol. Para una entrega ya registrada hay que actualizarla a mano, que es lo
-- que hace esta migración.
--
-- Sin esto la zaranda seguía contada como texto suelto en el pañol de
-- CORRIENTES en vez de contra su tipo, que es justamente lo que se quería
-- arreglar.

begin;

update herr_entregas e
   set material_id      = i.material_id,
       descripcion      = i.descripcion,
       descripcion_norm = norm_txt(i.descripcion),
       nota             = coalesce(e.nota || ' | ', '')
                          || 'enganchada al tipo el 10/09: se creó la ficha de la zaranda '
                          || 'desde el texto libre del pedido 724'
  from solicitud_compra_item i
 where e.item_id = i.id
   and i.id = 3672
   and e.material_id is null
   and e.estado <> 'anulada';

commit;
