-- Drop tablas del sistema de remitos de herramientas (código dormido).
--
-- Contexto: el 2026-05-19 se decidió que el sistema de remitos paralelo
-- no se usaba en la práctica. Se reemplazó por el modal post-movimiento
-- que ofrece "Imprimir remito triplicado" usando los datos del movimiento.
-- El código del módulo (HerrRemitos.tsx, useRemitos.ts, remitos.routes.ts)
-- quedó dormido y se eliminó el 2026-05-20 junto con los tipos `Remito` y
-- `RemitoItem`. Esta migración cierra el ciclo borrando las tablas.
--
-- IMPORTANTE: NO aplicar sin verificar primero que no haya filas
-- huérfanas que el negocio necesite preservar:
--   select count(*) from remitos;
--   select count(*) from remito_items;
-- Si hay filas, exportarlas a CSV antes de correr el DROP.

drop table if exists remito_items;
drop table if exists remitos;
