-- Las botas de goma son herramienta, no EPP: van y vuelven
--
-- El dueno, sobre el renglon "pares de botas" de 9 DE JULIO (CC-013): "esas son
-- las botas de goma que se usan para hormigonar, serian como herramientas", y
-- despues: "las botas normalmente si vuelven".
--
-- Esa es toda la diferencia, y define el tratamiento:
--   EPP         -> se consume, no vuelve. Queda en la cuenta de la obra como
--                  gasto propio de CADINC y suma al costo de esa obra.
--   HERRAMIENTA -> va y vuelve. SALE de la cuenta (un trigger borra la fila) y
--                  pasa al panol, donde queda registrada la salida y se espera
--                  el retorno.
--
-- El BOTIN de seguridad (ficha 659) se queda como EPP a proposito: es calzado
-- personal, se le asigna a un operario y no vuelve. Son dos cosas distintas
-- aunque las dos sean calzado.
--
-- La ficha 660 no tenia NI UN renglon todavia, asi que cambiarle la clase no
-- toca ningun dato historico. Se le agregan los sinonimos con los que la obra
-- las pide de verdad ("pares de botas" era texto libre sin vincular).
--
-- LOS TRES PASOS, en este orden y no en otro (CLAUDE.md §5.12):
--   1. la ficha pasa a herramienta y se muda al rubro de herramientas;
--   2. la fila de la cuenta se borra A MANO con su evento, porque el trigger
--      trg_mcc_sin_herramientas es AFTER INSERT y no corre al vincular un
--      renglon que ya existia;
--   3. recien ahi se vincula el renglon, que es lo que dispara el panol
--      (es_herramienta_item lo reconoce por el brazo 'catalogo').
--
-- Probado con rollback: la cuenta de CC-013 pasa de 55 a 54 renglones a cobrar,
-- la deuda del cliente NO se mueve (las botas estaban en $0) y el panol recibe
-- una salida de 3 unidades a CC-013.

update public.stock_materiales
   set clase    = 'herramienta',
       rubro_id = 26,
       alias    = array['botas', 'botas de goma', 'pares de botas', 'bota de goma',
                        'botas de agua', 'botas de lluvia', 'botas para hormigonar'],
       obs      = 'Van y vuelven de la obra: se prestan para hormigonar y se devuelven al panol. Por eso son herramienta y no EPP, a diferencia del botin de seguridad (ficha 659), que es calzado personal asignado.'
 where id = 660;

insert into public.solicitud_item_eventos
  (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
select i.id, i.solicitud_id, 'sacado_de_cuenta_cliente', i.estado, i.estado, c.cantidad,
       'Las botas son herramienta: van y vuelven de la obra. Pasan al panol.',
       jsonb_build_object('mcc_id', c.id, 'obra_cod', c.obra_cod, 'precio_total', c.precio_total,
                          'migracion', '20260914ad'),
       null
  from public.materiales_a_cuenta_cliente c
  join public.solicitud_compra_item i on i.id = c.item_id
 where c.id = 2565;

delete from public.materiales_a_cuenta_cliente where id = 2565;

update public.solicitud_compra_item set material_id = 660 where id = 2728;
