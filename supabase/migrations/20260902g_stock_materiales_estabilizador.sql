-- =====================================================================
-- Catálogo de materiales: el estabilizador de portón que faltaba.
--
-- Quedó afuera de 20260902f por un olvido: el encabezado de esa migración
-- lo lista como resuelto pero el INSERT nunca lo incluyó. Lo detectó la
-- verificación posterior a aplicar, no la auditoría previa.
--
-- El dueño no sabía qué era, pero los datos lo resuelven: los 4 pedidos
-- son de la misma obra (CC CLINICA HERAS), la misma persona y las mismas
-- fechas, y dos dicen explícitamente "de portón".
-- =====================================================================
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  (7, 'Estabilizador p/ portón corredizo', 'unid', 0, 0, 0, true,
     array['estabilizador', 'estabilizadores', 'estabilizador porton',
           'estabilizador de porton', 'estabilizador doble']::text[]);
