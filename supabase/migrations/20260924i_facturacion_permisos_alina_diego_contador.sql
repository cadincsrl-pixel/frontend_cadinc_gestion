-- 20260924i — Facturación: permisos para Alina, Diego y la contadora (user 2026-09-23)
--
-- Reparto del plan (Proyectos/Facturación electrónica ARCA - plan 2026-09-23.md §7):
--   · Alina y Diego: cargan clientes y facturas y EMITEN facturas. No hacen
--     notas de crédito ni registran en Finnegans.
--   · Mariana Dibe (rol contador): hace las NOTAS DE CRÉDITO y REGISTRA en
--     Finnegans. Para una NC tiene que poder cargar el borrador, así que lleva
--     creacion/actualizacion; no emite facturas.
-- `emitir_notas_credito` va separado de `emitir_facturas` a propósito: la NC
-- baja ingresos. El admin (Franco) hace bypass de todo.
--
-- `modulos` se deriva de `permisos` (CLAUDE.md §5.5): se recalcula acá porque
-- esto no pasa por el backend. Los tres quedan `personalizado = true`.
update public.profiles p
   set permisos = coalesce(p.permisos, '{}'::jsonb) || jsonb_build_object('facturacion', v.fact),
       personalizado = true
  from (values
    ('88b5a314-9983-45f8-8c1a-ebbac33f272f'::uuid, jsonb_build_object(   -- Alina fernandez
       'lectura', true, 'creacion', true, 'actualizacion', true, 'eliminacion', true,
       'tabs', jsonb_build_array('facturas', 'clientes'),
       'emitir_facturas', true, 'emitir_notas_credito', false, 'registrar_finnegans', false)),
    ('ed457d11-ad13-4ff3-95b8-aeee2ac52e4f'::uuid, jsonb_build_object(   -- Diego Bonilla
       'lectura', true, 'creacion', true, 'actualizacion', true, 'eliminacion', true,
       'tabs', jsonb_build_array('facturas', 'clientes'),
       'emitir_facturas', true, 'emitir_notas_credito', false, 'registrar_finnegans', false)),
    ('c5c138b1-8896-4561-b7d6-eb9caba23ac0'::uuid, jsonb_build_object(   -- Mariana Dibe (contadora)
       'lectura', true, 'creacion', true, 'actualizacion', true, 'eliminacion', false,
       'tabs', jsonb_build_array('facturas', 'clientes', 'finnegans'),
       'emitir_facturas', false, 'emitir_notas_credito', true, 'registrar_finnegans', true))
  ) as v(id, fact)
 where p.id = v.id;

update public.profiles
   set modulos = public.modulos_de_permisos(permisos)
 where id in ('88b5a314-9983-45f8-8c1a-ebbac33f272f', 'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f', 'c5c138b1-8896-4561-b7d6-eb9caba23ac0');
