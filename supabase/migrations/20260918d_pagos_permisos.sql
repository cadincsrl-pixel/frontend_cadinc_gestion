-- =====================================================================
-- Módulo Pagos, fase 1 — permisos (2026-09-18)
--
-- Módulo nuevo `pagos` (clave = prefijo /api/pagos). permisos.pagos =
--   { lectura, creacion, actualizacion, eliminacion, tabs[], registrar_pagos,
--     aprobar_facturas, anular_pagos, ver_pii }
-- Tabs de fase 1: facturas, pagos, proveedores (resumen llega en fase 2 y
-- recién ahí se declara: un tab que no existe no se declara).
--
-- Decisiones del dueño del 18/09 que cambian lo que decía el diseño v3:
--   1. Diego Bonilla CARGA Y APRUEBA: lectura + creacion + actualizacion +
--      aprobar_facturas + ver_pii. Lo que carga él no lo puede aprobar
--      (NO_PUEDE_APROBAR_PROPIA, lo aprueba Franco); en "Aprobar N" sus
--      propias salen como omitidas.
--   2. Franco (rol admin) hace bypass de las tres separaciones de funciones.
--  12. El contador nace con anular_pagos desde el arranque.
--
-- Plantillas (tabla roles, editables desde Admin › Plantillas):
--   * contador (NUEVA, rol_base = null): lectura + registrar_pagos +
--     anular_pagos + ver_pii, tabs facturas/pagos/proveedores, SIN creacion ni
--     actualizacion. Carga los datos de pago del proveedor por
--     PATCH /proveedores/:id/datos-pago. La cuenta la crea el dueño desde
--     Admin › Usuarios con esta plantilla.
--   * compras: pagos lectura/creacion/actualizacion + ver_pii, tabs
--     facturas/proveedores, SIN flags de pago.
--   * administrativo: pagos lectura/creacion/actualizacion + ver_pii (todas
--     las tabs), SIN flags de pago: una plantilla que junte creacion con
--     registrar_pagos deja pagar sin que nadie apruebe.
--
-- Usuarios concretos (todos personalizado = true, "Aplicar a N" no los toca):
--   * Diego Bonilla: como dice la decisión 1, tabs facturas/proveedores.
--   * Nicolás Valdez y Alina Fernández: como compras.
--   * modulos = modulos_de_permisos(permisos) (regla de 20260906s: los
--     módulos se derivan de los permisos con lectura).
--
-- Cambiar un rol no toca a nadie hasta "Aplicar a N usuarios"; hoy no hay
-- usuarios no personalizados en compras ni administrativo.
-- =====================================================================

-- ── Plantilla nueva: contador ─────────────────────────────────────────
insert into public.roles (key, label, descripcion, permisos, obras_scope_default, rol_base, orden)
values (
  'contador', 'Contador',
  'Paga facturas aprobadas: bandeja por vencimiento, órdenes de pago con comprobante a la cuenta del padrón, anular OP, datos de pago del proveedor. No carga ni edita facturas.',
  '{"pagos": {"lectura": true, "creacion": false, "actualizacion": false, "eliminacion": false,
              "tabs": ["facturas", "pagos", "proveedores"],
              "registrar_pagos": true, "aprobar_facturas": false, "anular_pagos": true, "ver_pii": true}}'::jsonb,
  'todas', null, 6)
on conflict (key) do update
  set label = excluded.label,
      descripcion = excluded.descripcion,
      permisos = excluded.permisos,
      obras_scope_default = excluded.obras_scope_default,
      rol_base = excluded.rol_base,
      activo = true;

-- ── compras y administrativo: cargan y editan, no pagan ni aprueban ───
update public.roles
   set permisos = jsonb_set(permisos, '{pagos}',
        '{"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false,
          "tabs": ["facturas", "proveedores"],
          "registrar_pagos": false, "aprobar_facturas": false, "anular_pagos": false, "ver_pii": true}'::jsonb, true)
 where key = 'compras';

update public.roles
   set permisos = jsonb_set(permisos, '{pagos}',
        '{"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false,
          "registrar_pagos": false, "aprobar_facturas": false, "anular_pagos": false, "ver_pii": true}'::jsonb, true)
 where key = 'administrativo';

-- ── Usuarios concretos ────────────────────────────────────────────────
do $$
declare
  n integer;
  v_diego  jsonb := '{"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false,
                      "tabs": ["facturas", "proveedores"],
                      "registrar_pagos": false, "aprobar_facturas": true, "anular_pagos": false, "ver_pii": true}'::jsonb;
  v_compras jsonb := '{"lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false,
                       "tabs": ["facturas", "proveedores"],
                       "registrar_pagos": false, "aprobar_facturas": false, "anular_pagos": false, "ver_pii": true}'::jsonb;
begin
  -- Diego Bonilla: carga y aprueba (lo suyo lo aprueba Franco).
  update public.profiles
     set permisos      = coalesce(permisos, '{}'::jsonb) || jsonb_build_object('pagos', v_diego),
         modulos       = public.modulos_de_permisos(coalesce(permisos, '{}'::jsonb) || jsonb_build_object('pagos', v_diego)),
         personalizado = true
   where id = 'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f' and rol = 'operador';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'DIEGO_NO_ACTUALIZADO: % filas', n; end if;

  -- Nicolás Valdez y Alina Fernández: como compras.
  update public.profiles
     set permisos      = coalesce(permisos, '{}'::jsonb) || jsonb_build_object('pagos', v_compras),
         modulos       = public.modulos_de_permisos(coalesce(permisos, '{}'::jsonb) || jsonb_build_object('pagos', v_compras)),
         personalizado = true
   where id in ('2e45e785-fa26-4e1a-8602-22fa093c39d8',   -- Nicolás Valdez
                '88b5a314-9983-45f8-8c1a-ebbac33f272f')   -- Alina Fernández
     and rol = 'operador';
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'COMPRAS_NO_ACTUALIZADOS: % filas', n; end if;
end $$;
