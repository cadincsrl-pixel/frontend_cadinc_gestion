-- =====================================================================
-- 20260924o — Ventas / Cobranzas: permisos (2026-09-24)
--
-- permisos.facturacion suma:
--   tabs:  'cobranzas', 'deudores', 'saldos_iniciales'
--   flags: registrar_cobros (registrar cobro, imputar a cuenta, compensar NC)
--          anular_cobros    (anular cobro o imputación)
--   Los dos flags son default FALSE (ausente = false, igual que _ventas_flag).
--   Las RPC de 20260924n los vuelven a validar en la base.
--
-- Reparto (contrato «Cobranzas y estado de deudores v1» §9):
--   · Mariana Dibe (contadora): las tres tabs + los dos flags. Mantiene
--     eliminacion = false (20260924i): borrar un saldo inicial queda para el
--     admin; ella lo corrige con PATCH o lo marca con ventas_externos_marcar.
--   · Alina y Diego: tabs 'cobranzas' y 'deudores', SOLO lectura del módulo
--     nuevo (flags en false explícito).
--   Las tabs nuevas van AL FINAL de la lista: el orden importa (la página
--   redirige a la primera) y ninguno tiene que aterrizar en Cobranzas.
--
-- Plantillas (tabla roles): ninguna tiene `facturacion` (20260924b no las
-- tocó a propósito), así que no hay plantilla que actualizar.
--
-- `modulos` se deriva de `permisos` (CLAUDE.md §5.5): se recalcula acá
-- porque esto no pasa por el backend. Quedan personalizado = true.
-- =====================================================================

with v(id, tabs_nuevas, flags) as (values
  ('c5c138b1-8896-4561-b7d6-eb9caba23ac0'::uuid,   -- Mariana Dibe (contadora)
   '["cobranzas", "deudores", "saldos_iniciales"]'::jsonb,
   '{"registrar_cobros": true, "anular_cobros": true}'::jsonb),
  ('88b5a314-9983-45f8-8c1a-ebbac33f272f'::uuid,   -- Alina fernandez
   '["cobranzas", "deudores"]'::jsonb,
   '{"registrar_cobros": false, "anular_cobros": false}'::jsonb),
  ('ed457d11-ad13-4ff3-95b8-aeee2ac52e4f'::uuid,   -- Diego Bonilla
   '["cobranzas", "deudores"]'::jsonb,
   '{"registrar_cobros": false, "anular_cobros": false}'::jsonb)
)
update public.profiles p
   set permisos = jsonb_set(
         coalesce(p.permisos, '{}'::jsonb), '{facturacion}',
         coalesce(p.permisos -> 'facturacion', '{}'::jsonb)
           || v.flags
           || jsonb_build_object('tabs',
                coalesce(p.permisos -> 'facturacion' -> 'tabs', '[]'::jsonb)
                || coalesce((select jsonb_agg(t order by n)
                               from jsonb_array_elements_text(v.tabs_nuevas) with ordinality as x(t, n)
                              where not coalesce(p.permisos -> 'facturacion' -> 'tabs', '[]'::jsonb) ? t), '[]'::jsonb))),
       personalizado = true
  from v
 where p.id = v.id;

update public.profiles
   set modulos = public.modulos_de_permisos(permisos)
 where id in ('c5c138b1-8896-4561-b7d6-eb9caba23ac0', '88b5a314-9983-45f8-8c1a-ebbac33f272f', 'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f');
