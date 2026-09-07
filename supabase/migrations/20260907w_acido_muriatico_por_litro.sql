-- 20260907w — El ácido muriático se mide por litro, no por botella (user 2026-09-07)
--
-- Sosa contó 10 y aclaró: "tenemos 2 bidones de 5 litros". La ficha decía
-- "Ácido muriático x 1lt" con unidad `unid`, como si fueran botellas sueltas.
-- El número 10 estaba bien (10 litros), el envase no.
--
-- Que se pide por litro ya estaba en los datos: 7 de los 9 renglones cargados
-- usan unidad `lt`, y los dos de cantidad 5 (CC-019 el 13/08 y el pendiente de
-- CC DEPOSITO del 03/09) son bidones escritos en litros.
--
-- EL CAMBIO DE UNIDAD ES SEGURO ACÁ, al revés que en el caso de la membrana
-- (ver 20260907s): la ficha decía "x 1lt", así que 1 unid ya era 1 litro. No se
-- reinterpreta ningún movimiento — y de hecho el único que existe es el ajuste
-- del recuento de hoy.
--
-- Por eso se renombra en el lugar en vez de abrir una ficha nueva: no hay
-- historia que se pueda leer mal, y partirla obligaría a adivinar si los seis
-- renglones de "1" eran una botella o un litro.
update public.stock_materiales
set nombre  = 'Ácido muriático x litro',
    unidad  = 'lt',
    alias   = array['acido', 'acido muriatico', 'acido muriatico x 1lt', 'bidon de acido muriatico'],
    obs     = 'Se cuenta y se pide POR LITRO. En el galpón viene en bidones de 5 litros: 1 bidón = 5. Precio de referencia sin cargar a propósito — las compras viejas mezclan precios de botella y de bidón, así que se espera a la reposición pendiente de CC DEPOSITO.'
where id = 778;

-- El renglón pendiente de reposición al depósito queda con el nombre nuevo.
-- Los 8 renglones ya enviados NO se tocan: son documentos emitidos.
update public.solicitud_compra_item
set descripcion = 'Ácido muriático x litro'
where id = 3451 and estado = 'pendiente';
