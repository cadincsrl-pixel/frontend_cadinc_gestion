-- 20260904bt — Cristian Sosa (depósito) ve solo "Salidas a obra" y "Retorno de obra" en Herramientas
--
-- Pedido del user 2026-09-04. Tenía tabs [inventario, movimientos, trazabilidad,
-- salidas]. Los permisos de acción (lectura/creación/actualización) no cambian:
-- confirmar salidas y registrar retornos usan 'actualizacion'. Junto con esto,
-- el frontend pasa a validar el tab en cada página de Herramientas (antes solo
-- se ocultaba del menú) y la entrada al módulo manda al primer tab permitido.

update public.profiles
   set permisos = jsonb_set(permisos, '{herramientas,tabs}', '["salidas","retornos"]'::jsonb)
 where id = '2c2895fc-479b-46eb-be89-956f8dccc42d'
   and permisos ? 'herramientas';
