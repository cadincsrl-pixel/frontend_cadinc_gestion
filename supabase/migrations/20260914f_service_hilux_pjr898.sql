-- Service general de la Hilux PJR898 (flota_vehiculos id 5), que el user avisó el 13/09.
--
-- Fecha 05/09 confirmada por él. Ese día el odómetro del GPS cruzó los 108.851 km,
-- que es exactamente donde el service anterior (25/04, a 98.851 km) había dejado
-- marcado el próximo. O sea que se hizo justo cuando tocaba.
--
-- El próximo queda en 118.851: +10.000 km, que es el intervalo que venía usando esta
-- camioneta, NO los 15.000 que dice `tipos_servicio`. Ojo con eso: `v_servicios_estado`
-- lee `medidor_proximo` de esta misma fila y no lo recalcula del tipo, así que el número
-- que se escriba acá es el que dispara el aviso.
--
-- Antes de esto la camioneta figuraba VENCIDA por 3.154 km.

insert into servicios (entidad, entidad_id, tipo_id, fecha, medidor, medidor_valor,
                       medidor_proximo, costo, proveedor, descripcion, created_by)
values ('flota', 5, 6, date '2026-09-05', 'km', 108851, 118851, 165000, 'HDI',
        'Service general hecho a los km que pedía (el anterior lo dejó marcado en 108.851)',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
