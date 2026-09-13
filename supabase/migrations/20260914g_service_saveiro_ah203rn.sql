-- Service de la Saveiro AH203RN (flota_vehiculos id 11), que el user avisó el 13/09.
-- Hasta ahora la camioneta figuraba SIN NINGÚN SERVICE cargado, con 27.996 km encima.
--
-- Datos firmes del user: esta unidad va cada 16.000 km, el service se hizo a los 16.000
-- en el concesionario oficial VW, y el próximo cae a los 32.000. Pidió expresamente que
-- quede cargado el 32.000 "así me acuerdo".
--
-- LA FECHA ES ESTIMADA. No tenía el comprobante ni recordaba el día. Tampoco se pudo leer
-- del GPS: el device de esta unidad arranca el 15/05/2026 con 19.807 km, o sea DESPUÉS del
-- service. Se extrapoló hacia atrás con el ritmo medido por GPS (67,7 km/día entre el
-- 15/05 y el 13/09), que da el 20/03/2026. `servicios.fecha` es NOT NULL, así que no había
-- opción de dejarla vacía; queda marcada como estimada en `obs` para que nadie la tome
-- como dato duro. Si el user encuentra el papelito, se corrige con un update de `fecha`.
--
-- El costo queda en NULL a propósito: no lo sabemos.
--
-- Nota de intervalo: `tipos_servicio` dice 15.000 km para "Service general", pero
-- `v_servicios_estado` lee `medidor_proximo` de esta fila y no recalcula del tipo, así que
-- los 16.000 de la Saveiro mandan. Con 27.996 km hoy quedan 4.004; el aviso "por vencer"
-- se enciende solo a los 31.000.

insert into servicios (entidad, entidad_id, tipo_id, fecha, medidor, medidor_valor,
                       medidor_proximo, proveedor, descripcion, obs, created_by)
values ('flota', 11, 6, date '2026-03-20', 'km', 16000, 32000,
        'Concesionario oficial VW',
        'Service oficial VW de los 16.000 km. Esta camioneta va cada 16.000, así que el próximo cae a los 32.000.',
        'FECHA ESTIMADA. El user no tenía el comprobante y no recordaba el día. El GPS de esta unidad arranca el 15/05/2026 con 19.807 km, o sea después del service, así que la fecha no se pudo leer: se extrapoló hacia atrás con el ritmo de uso medido por GPS (67,7 km/día). El kilometraje (16.000) y el próximo (32.000) SÍ los dio el user y son firmes.',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
