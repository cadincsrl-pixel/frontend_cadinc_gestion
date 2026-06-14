-- ════════════════════════════════════════════════════════════════════
-- Alquiler — recálculo atómico de importes al cambiar el precio/hora.
--
-- Antes: updateObraMaquina, cuando cambiaba precio_hora, leía TODOS los
-- partes de la (obra, máquina) con un .select() (que topea en el hard cap
-- de 1000 filas de PostgREST → partes viejos quedaban sin recalcular) y
-- hacía un UPDATE por parte en un loop (N+1, no atómico: un corte a mitad
-- dejaba unos partes con el precio nuevo y otros con el viejo).
--
-- Ahora: UN solo UPDATE server-side sobre alquiler_partes, sin traer filas
-- ni topear en 1000, y atómico (todo o nada dentro de la transacción).
--
-- REDONDEO: el backend calcula importe = Math.round(horas × precio × 100)/100
-- (calcImporte). Lo replicamos con round(horas × precio, 2) — round/2 en
-- numeric usa banker's? NO: PostgreSQL round(numeric, int) redondea
-- half-away-from-zero, igual que Math.round para positivos (horas y precio
-- son no-negativos por schema), así que coinciden.
--
-- p_precio_hora NULL = máquina sin tarifa → importe NULL (coherente con
-- calcImporte, que devuelve null si precio es null).
--
-- SECURITY DEFINER → llamar SIEMPRE con el cliente admin (CLAUDE.md §9).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalcular_importe_partes(
  p_obra_id     integer,
  p_maquina_id  integer,
  p_precio_hora numeric
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filas integer;
BEGIN
  UPDATE public.alquiler_partes
     SET precio_hora = p_precio_hora,
         importe     = CASE
                         WHEN p_precio_hora IS NULL THEN NULL
                         ELSE round(COALESCE(horas, 0) * p_precio_hora, 2)
                       END
   WHERE obra_id = p_obra_id
     AND maquina_id = p_maquina_id;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;  -- cantidad de partes recalculados (útil para logging)
END;
$$;

-- §9: solo service_role ejecuta funciones SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.recalcular_importe_partes(integer, integer, numeric)
  FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recalcular_importe_partes(integer, integer, numeric)
  TO service_role;
