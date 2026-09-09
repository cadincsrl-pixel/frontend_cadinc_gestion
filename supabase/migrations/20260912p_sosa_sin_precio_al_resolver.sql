-- Sosa despacha sin poner precio (flag `precio_al_resolver`)
--
-- El user (09/09): "que Sosa solo tenga opción de poner después cuando
-- resuelva él, que no ponga precio".
--
-- El depósito resuelve pedidos todo el día pero no maneja los números de la
-- cuenta del cliente. Cuando el formulario le exige un precio, pone lo que
-- sea: entre el 08 y el 09/09 nacieron cinco fichas con "$11" y un despacho
-- de alfombra quedó en $66 cuando eran $459.000. Un renglón SIN precio se ve
-- en la alerta de "sin precio" y alguien lo corrige; uno con precio inventado
-- no lo ve nadie hasta que sale en la factura.
--
-- El flag es una capacidad POSITIVA con default true (como ver_costos): quien
-- no lo tenga explícitamente en false sigue cargando precios igual que hoy.
-- Solo se apaga para el depósito.
--
-- Con el flag apagado:
--   · comprar   → el backend fuerza precio 0 + esperando_precio, y la pantalla
--                 muestra "el precio lo carga administración" en vez del campo.
--   · despachar → va en 0 y queda a tasar (que es lo que el despacho ya
--                 admitía; ahora deja de depender de que se acuerde).
-- Los renglones aparecen igual en la lista de pendientes de tasar y en
-- "Cargar precios".

update public.profiles
   set permisos = jsonb_set(
         permisos,
         '{certificaciones,precio_al_resolver}',
         'false'::jsonb,
         true)
 where nombre = 'Cristian Sosa'
   and permisos ? 'certificaciones';
