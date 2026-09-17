-- =====================================================================
-- Diego marca consumibles propios (2026-09-17)
--
-- Pedido del user: "que Diego en obras con presupuesto cerrado pueda poner
-- consumibles propios".
--
-- Marcar un renglón como consumible propio (POST /api/cuenta-cliente/consumible)
-- pedía el flag `cargar_precios`, que Diego no tiene. Darle ese flag lo
-- habilitaba también a valuar la cuenta del cliente, aprobar propuestas de
-- precio, tocar el catálogo y emitir certificados (§5.14): mucho más de lo
-- pedido. Se creó el flag `marcar_consumibles` (default false), que es SOLO
-- esa capacidad; el backend acepta cualquiera de los dos.
--
-- "En obras con presupuesto cerrado" no hace falta escribirlo en el permiso:
-- la RPC marcar_consumible_propio ya rechaza las obras por administración
-- (OBRA_POR_ADMINISTRACION) y las llave en mano (OBRA_LLAVE_EN_MANO), así que
-- el flag sólo llega a las de presupuesto cerrado.
--
-- Diego ya es `personalizado = true` (no sigue ninguna plantilla), así que
-- "Aplicar a N usuarios" desde una plantilla no le pisa esto.
-- =====================================================================

do $$
declare
  n integer;
begin
  update profiles
     set permisos      = jsonb_set(permisos, '{certificaciones,marcar_consumibles}', 'true'::jsonb),
         personalizado = true
   where id = 'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f'   -- Diego Bonilla
     and permisos ? 'certificaciones';                  -- jsonb_set no crea claves intermedias
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'DIEGO_NO_ACTUALIZADO: % filas', n;
  end if;
end $$;
