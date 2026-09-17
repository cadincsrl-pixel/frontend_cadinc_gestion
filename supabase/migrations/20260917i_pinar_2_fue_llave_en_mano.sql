-- PINAR 2 (ARREGLO) fue llave en mano, no presupuesto cerrado
--
-- El user, 17/09, apenas vio el resumen nuevo de todas las obras: "la obra
-- pinar 2 fue llave en mano". CC-024 estaba cargada con
-- `materiales_a_cargo_de = 'cliente'`, así que sus 32 renglones despachados
-- figuraban como deuda del cliente: $957.303,96 a cobrar, 4 de ellos sin
-- precio. En llave en mano el material es costo de CADINC y no se factura.
--
-- Es el primer arreglo que salió del resumen, a los minutos de existir: una
-- obra que debía casi un millón que nunca iba a cobrarse.
--
-- QUÉ ARRASTRA, Y POR QUÉ ESTA VEZ NO HAY QUE TOCAR NADA MÁS. El trigger
-- `trg_obras_recalc_a_cargo_de` (AFTER UPDATE OF materiales_a_cargo_de sobre
-- obras) recalcula `a_cargo_de` de toda la cuenta del cliente con
-- `calc_a_cargo_de`: los 32 renglones pasan de `cliente` a `cadinc` y el
-- estado derivado en `v_cuenta_corriente` pasa de `a_cobrar` a
-- `gasto_cadinc`. Probado con rollback: 33 renglones en gasto_cadinc, $963.304
-- (los 32 más el que ya lo era), cero en a_cobrar.
--
-- No hay nada congelado que soltar: la obra no tiene cobros, ni certificados,
-- ni renglones con cobro_id o certificado_id. Tampoco porcentajes cargados.
--
-- Lo que NO cambia: los precios de los renglones (siguen siendo el costo
-- real, que es lo que muestra el panel de costos de la obra) ni los 4 sin
-- precio, que ahora son costo sin tasar en vez de deuda sin tasar.

update public.obras
   set materiales_a_cargo_de = 'cadinc',
       updated_at = now()
 where cod = 'CC-024'
   and materiales_a_cargo_de = 'cliente';
