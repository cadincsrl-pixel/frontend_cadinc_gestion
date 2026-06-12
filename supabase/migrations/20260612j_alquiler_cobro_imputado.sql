-- Alquiler — cobro imputado a remitos (mismo modelo que áridos 20260612g):
-- un cobro puede "cancelar" remitos puntuales del cliente. ON DELETE SET NULL
-- para que al borrar el cobro los remitos vuelvan a estado adeudado.
-- El saldo NO cambia de fórmula (devengado − cobros); esto es trazabilidad.
ALTER TABLE alquiler_remitos
  ADD COLUMN cobro_id integer REFERENCES alquiler_cobros(id) ON DELETE SET NULL;
