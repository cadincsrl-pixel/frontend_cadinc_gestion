-- =====================================================================
-- 20260927z — Contabilidad: permisos de Mariana Dibe (2026-09-24)
--
-- Con el OK del dueño (24/09): el estudio contable cierra los meses y carga
-- los sueldos directamente en el ERP, así que Mariana tiene el módulo entero:
--   lectura, creación y actualización (eliminación queda en false, igual que
--   en Ventas: borrar es del admin), todas las tabs de la fase 1 y la 3, y
--   los flags asientos_manuales, cerrar_periodos, editar_plan, contabilizar
--   y editar_mapeos.
-- Letra «z» a propósito: la serie 20260927 la usan en paralelo las
-- migraciones de la fase 3 y esta no depende de ninguna de ellas.
-- `modulos` se recalcula acá porque esto no pasa por el backend.
-- =====================================================================

update public.profiles
   set permisos = jsonb_set(coalesce(permisos, '{}'::jsonb), '{contabilidad}', jsonb_build_object(
         'lectura', true, 'creacion', true, 'actualizacion', true, 'eliminacion', false,
         'tabs', '["asientos", "diario", "mayor", "sumas-saldos", "plan", "periodos", "automaticos", "mapeos"]'::jsonb,
         'asientos_manuales', true, 'cerrar_periodos', true, 'editar_plan', true,
         'contabilizar', true, 'editar_mapeos', true)),
       personalizado = true
 where id = 'c5c138b1-8896-4561-b7d6-eb9caba23ac0';   -- Mariana Dibe

update public.profiles
   set modulos = public.modulos_de_permisos(permisos)
 where id = 'c5c138b1-8896-4561-b7d6-eb9caba23ac0';
