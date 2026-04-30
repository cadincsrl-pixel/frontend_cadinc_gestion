-- =====================================================================
-- RPC obras_a_auto_archivar(p_dias_atras int)
--
-- Reemplaza la lógica que estaba en obras.service.ts (autoArchivar) que
-- traía TODAS las filas de `horas` y `certificaciones` a Node y dedupeaba
-- en JS. Ese enfoque rompía con el cap de filas de PostgREST (típico
-- 1000) y archivaba obras que sí tenían actividad pero quedaban después
-- del corte físico de la query.
--
-- Esta función calcula del lado del servidor con NOT EXISTS contra los
-- índices de cada tabla, así no depende de cuántas filas haya.
-- =====================================================================

CREATE OR REPLACE FUNCTION obras_a_auto_archivar(p_dias_atras int DEFAULT 21)
RETURNS TABLE (cod text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH corte AS (
    SELECT (current_date - p_dias_atras)::date AS d
  )
  SELECT o.cod
  FROM obras o
  CROSS JOIN corte c
  WHERE o.archivada = false
    -- No archivar obras recién creadas (todavía no se cargaron horas).
    AND o.created_at < (c.d::timestamptz)
    -- Sin horas de personal en la ventana.
    AND NOT EXISTS (
      SELECT 1 FROM horas h
      WHERE h.obra_cod = o.cod
        AND h.fecha >= c.d
    )
    -- Sin certificaciones de contratistas en la ventana.
    AND NOT EXISTS (
      SELECT 1 FROM certificaciones cc
      WHERE cc.obra_cod = o.cod
        AND cc.sem_key >= c.d
    );
$$;

GRANT EXECUTE ON FUNCTION obras_a_auto_archivar(int) TO authenticated;
