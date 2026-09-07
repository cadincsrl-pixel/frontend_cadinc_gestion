-- 20260907z — La masilla Durlock viene en dos presentaciones (user 2026-09-07:
-- "tengo un tacho de masilla de 18 kg nuevo, viene en esas dos presentaciones")
--
-- La ficha 920 decía "x 17kg" apoyada en UN solo renglón (Silva, 28/08,
-- $31.811,77). El user tiene el balde en la mano y dice 18. Gana el envase:
-- se renombra y el "17" queda de alias para que las búsquedas viejas peguen.
update public.stock_materiales
set nombre = 'Masilla Durlock x 18kg',
    alias  = array['masilla x 18','masilla x 18 kg','masilla durlock 18',
                   'masilla x 17','masilla durlock 17','masilla chica'],
    obs    = 'Durlock lista para usar, multiuso. Es la presentacion chica de las dos que existen (la otra es la de 32 kg, ficha 80). Figuraba como 17 kg por un unico renglon; el user confirmo 18 mirando el balde el 07/09.'
where id = 920;

-- La ficha de 7 kg nunca se uso: cero renglones, cero movimientos, sin precio.
-- El user dice que la masilla viene en dos presentaciones y esta no es ninguna.
-- Se desactiva (reversible); no se borra por si aparece en algun audit_log.
update public.stock_materiales
set activo = false,
    obs = 'Desactivada el 07/09: nunca tuvo un renglon ni un movimiento, y el user confirmo que la masilla Durlock viene en dos presentaciones, 32 kg y 18 kg. Si aparece un balde de 7, reactivar.'
where id = 81;

-- El tacho nuevo que contó el user.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
values
  (920, 'ajuste', 1, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07',
   'Recuento del deposito 2026-09-07: el sistema decia 0 y el user conto 1 tacho sin abrir. La ficha nunca tuvo un movimiento de stock pese a la compra a Silva del 28/08.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

-- NO se tocan los renglones de la ficha 80 aunque su historial de precios
-- muestra que ahi se cargaron las dos presentaciones y hasta compras por kilo:
-- $50.681 y $49.687 el balde (32 kg), tres de $33.835 (que por precio son la de
-- 18), $5.164, $3.091, y dos compras en unidad "kg" a $2.198 y $4.643. Los
-- trece estan en `enviado` y en la cuenta del cliente: reasignarlos por
-- parecido de precio seria adivinar sobre documentos emitidos. Queda anotado
-- en el diario para revisarlo contra las facturas de Silva.
