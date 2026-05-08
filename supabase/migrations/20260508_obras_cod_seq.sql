-- Códigos de obra autogenerados (CC-NNN, 3 dígitos).
--
-- Antes: el admin tipeaba el código a mano en el modal "Nueva obra".
-- Riesgos: typos, duplicados, inconsistencia (CC-001 vs cc-1 vs cc 1).
-- Y `obras.cod` es PK + FK desde muchas tablas (horas, asignaciones,
-- usuario_obras, solicitudes_compra, etc), así que un código mal
-- escrito complica los joins.
--
-- Ahora: una SEQUENCE genera el siguiente número atómicamente. La
-- RPC `siguiente_codigo_obra()` devuelve el código formateado.
-- El backend POST /api/obras ignora cualquier `cod` del body y usa
-- el resultado de la RPC.
--
-- Las obras EXISTENTES con códigos no-numéricos (CC RETRO, CC DEPOSITO,
-- cc 24, etc) quedan intactas. La sequence solo cuenta para los CC-NNN
-- nuevos, así que nunca colisiona con los legacy.

-- 1) Crear sequence (cached=1 para que el siguiente sea predecible).
CREATE SEQUENCE IF NOT EXISTS obras_cod_seq
  START WITH 1
  INCREMENT BY 1
  CACHE 1;

-- 2) Inicializarla al máximo número actual de los CC-NNN existentes.
--    setval con `is_called=true` significa "el próximo nextval devuelve
--    valor+1". Si no hay CC-NNN, queda en 0 → próximo nextval = 1.
DO $$
DECLARE
  v_max int;
BEGIN
  SELECT COALESCE(MAX((substring(cod from 'CC-(\d+)$'))::int), 0)
  INTO v_max
  FROM obras
  WHERE cod ~ '^CC-\d+$';

  -- Si max=0 (sin códigos previos), seteamos en 1 con is_called=false
  -- para que el primer nextval devuelva 1. Si max>=1, seteamos con
  -- is_called=true para que el próximo sea max+1.
  IF v_max = 0 THEN
    PERFORM setval('obras_cod_seq', 1, false);
  ELSE
    PERFORM setval('obras_cod_seq', v_max, true);
  END IF;
END $$;

-- 3) RPC que devuelve el SIGUIENTE código (consume la sequence).
--    Atómica vs concurrencia (la sequence garantiza unicidad incluso
--    bajo dos creates simultáneos).
CREATE OR REPLACE FUNCTION siguiente_codigo_obra()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CC-' || LPAD(nextval('obras_cod_seq')::text, 3, '0');
$$;

-- 4) RPC que devuelve el siguiente SIN consumir (para preview en UI).
--    NO usa nextval; mira el last_value de la sequence + 1. Puede dar
--    un valor desfasado si hay un nextval entre el preview y el insert,
--    pero el insert usa `siguiente_codigo_obra` así que el final es
--    siempre el correcto.
CREATE OR REPLACE FUNCTION proximo_codigo_obra_preview()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CC-' || LPAD((
    CASE
      WHEN is_called THEN last_value + 1
      ELSE last_value
    END
  )::text, 3, '0')
  FROM obras_cod_seq;
$$;

-- Permisos: ambas RPC accesibles vía PostgREST (anon + authenticated).
-- En la práctica el frontend llama vía el backend Hono, así que el grant
-- es para coherencia.
GRANT EXECUTE ON FUNCTION siguiente_codigo_obra()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION proximo_codigo_obra_preview()   TO authenticated, service_role;
