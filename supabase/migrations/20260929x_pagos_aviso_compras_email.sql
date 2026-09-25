-- =====================================================================
-- Compras: el aviso de pago también le llega a Compras (2026-09-25)
--
-- Pedido del dueño: «junto al contador necesito que los comprobantes se
-- envíen a compras comprascadinc@gmail.com».
--
-- 1) Clave nueva de `pagos_config`: `aviso_compras_email` (null o un mail
--    válido, misma validación que `aviso_contador_email`). Se edita desde
--    Compras › Configuración › Avisos de pago («Mail de compras (copia)»).
--    Recibe el MISMO paquete que el contador: comprobante(s), incluidos los
--    archivos de cheque/e-cheq, más las facturas que cubre la OP. Sale como
--    un mail propio (destinatario 'compras'), no como CC del contador: así
--    cada uno queda en el historial con su estado.
-- 2) `pagos_ordenes_avisos.destinatario` admite 'compras'.
-- 3) `pagos_config_json` y `pagos_guardar_config`: parche por ancla sobre la
--    definición viva (pg_temp._una), para no pisar otra cosa.
--
-- Después de aplicar, el valor se cargó UNA vez por la puerta de siempre
-- (no forma parte de la migración: es un dato operativo):
--   select public.pagos_guardar_config(
--     '{"aviso_compras_email":"comprascadinc@gmail.com"}'::jsonb,
--     'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
-- =====================================================================

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- ── 1) Las claves y los destinatarios ──
alter table public.pagos_config drop constraint pagos_config_clave_check;
alter table public.pagos_config add constraint pagos_config_clave_check check (clave = any (array[
  'tributo_jurisdiccion_default_id', 'aviso_contador_email', 'aviso_compras_email', 'aviso_responder_a',
  'aviso_nombre_remitente', 'aviso_pie_texto', 'plazos_cheque']::text[]));

alter table public.pagos_ordenes_avisos drop constraint pagos_ordenes_avisos_destinatario_check;
alter table public.pagos_ordenes_avisos add constraint pagos_ordenes_avisos_destinatario_check
  check (destinatario = any (array['proveedor', 'contador', 'compras']::text[]));

-- ── 2) Lectura ──
do $m$
declare
  v text := pg_get_functiondef('public.pagos_config_json()'::regprocedure);
begin
  v := pg_temp._una(v,
$a$    'aviso_responder_a',
$a$,
$a$    'aviso_compras_email',
      (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from c where clave = 'aviso_compras_email'),
    'aviso_responder_a',
$a$);
  execute v;
end $m$;

-- ── 3) Escritura: misma validación que el mail del contador ──
do $m$
declare
  v text := pg_get_functiondef('public.pagos_guardar_config(jsonb,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$      when 'aviso_contador_email', 'aviso_responder_a', 'aviso_nombre_remitente', 'aviso_pie_texto' then$a$,
$a$      when 'aviso_contador_email', 'aviso_compras_email', 'aviso_responder_a', 'aviso_nombre_remitente', 'aviso_pie_texto' then$a$);
  v := pg_temp._una(v,
$a$          if v_k in ('aviso_contador_email', 'aviso_responder_a') then$a$,
$a$          if v_k in ('aviso_contador_email', 'aviso_compras_email', 'aviso_responder_a') then$a$);
  execute v;
end $m$;
