-- =====================================================================
-- personal.fecha_nacimiento
--
-- Permite registrar el cumpleaños de cada trabajador. La columna es
-- nullable porque se va a ir cargando de a poco.
-- Se usa también para la campana de notificaciones del topbar.
-- =====================================================================

ALTER TABLE personal ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
