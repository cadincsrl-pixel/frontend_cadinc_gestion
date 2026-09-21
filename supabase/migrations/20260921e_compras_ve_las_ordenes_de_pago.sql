-- =====================================================================
-- Compras ve las órdenes de pago y baja los comprobantes (2026-09-21)
--
-- Pedido del dueño: que Nicolás, Alina y Diego puedan bajar los comprobantes
-- de pago que sube el contador.
--
-- Lo que YA estaba y no se toca: los tres entran al módulo, cargan facturas
-- (`creacion` + tab `facturas`) y Diego aprueba (`aprobar_facturas`). Eso se
-- configuró el 18/09 al armar el módulo.
--
-- Lo que faltaba es SOLO la pantalla. A nivel de API ya podían: las rutas de
-- órdenes usan `requireTab('pagos', TAB_PAGO)` y `TAB_PAGO = ['facturas',
-- 'pagos']`, o sea que con el tab `facturas` ya pasaban el guard de
-- `GET /ordenes`, `GET /ordenes/:id/adjuntos` y del `signed-url` que baja el
-- archivo. Lo que no tenían era el tab `pagos` en su perfil, así que la
-- pantalla de Órdenes no aparecía en el sidebar y no había desde dónde
-- tocar el comprobante.
--
-- QUÉ NO HABILITA ESTE TAB, verificado ruta por ruta:
--   · emitir una OP, editarla, subir o borrar adjuntos → piden el flag
--     `registrar_pagos`, que los tres tienen en false.
--   · anular una OP → la ruta no lleva guard de flag, pero el service exige
--     admin, `anular_pagos`, o `registrar_pagos` sobre una OP propia y del
--     día (pagos.service.ts anularOrden). Ninguno de los tres califica: 403.
--   En la UI los botones ya salen deshabilitados por el mismo criterio
--   (OrdenesTab: puedeAnular / puedeSubir).
--
-- El orden del array IMPORTA: `useTabsPermitidos` devuelve los tabs tal cual
-- se guardan y `PagosPage` redirige a `allowedTabs[0]`. Se escribe en el
-- orden canónico para que `facturas` siga siendo la pantalla de entrada.
-- =====================================================================

do $$
declare
  n integer;
begin
  update profiles
     set permisos      = jsonb_set(permisos, '{pagos,tabs}',
                                   '["facturas", "pagos", "proveedores"]'::jsonb),
         personalizado = true
   where id in (
           '2e45e785-fa26-4e1a-8602-22fa093c39d8',  -- Nicolas Valdez
           '88b5a314-9983-45f8-8c1a-ebbac33f272f',  -- Alina fernandez
           'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f'   -- Diego Bonilla
         )
     and permisos ? 'pagos'                          -- jsonb_set no crea claves intermedias
     and not (permisos->'pagos'->'tabs' @> '["pagos"]'::jsonb);
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'PERFILES_NO_ACTUALIZADOS: % de 3', n;
  end if;

  -- Que ninguno se haya llevado de garrón un permiso de escritura.
  perform 1 from profiles
   where id in ('2e45e785-fa26-4e1a-8602-22fa093c39d8',
                '88b5a314-9983-45f8-8c1a-ebbac33f272f',
                'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f')
     and (coalesce((permisos->'pagos'->>'registrar_pagos')::boolean, false)
          or coalesce((permisos->'pagos'->>'anular_pagos')::boolean, false));
  if found then
    raise exception 'ESCRITURA_INESPERADA: alguno quedó con registrar_pagos o anular_pagos';
  end if;
end $$;
