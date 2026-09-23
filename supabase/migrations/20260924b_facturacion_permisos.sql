-- =====================================================================
-- Facturación electrónica, fase 1 — permisos (2026-09-24)
--
-- Módulo nuevo `facturacion` (clave = prefijo /api/facturacion). Forma de
-- profiles.permisos.facturacion:
--   { lectura, creacion, actualizacion, eliminacion,
--     tabs: ['facturas', 'clientes', 'finnegans'],
--     emitir_facturas, emitir_notas_credito, registrar_finnegans }
-- Los tres flags son default FALSE. `emitir_notas_credito` va separado de
-- `emitir_facturas` a propósito: anular una factura es otra decisión.
--
-- Catálogo: la lista de módulos vive en el código (`src/lib/modulos.ts` del
-- backend y `src/lib/config/modulos.ts` del frontend), no en la base. En la
-- base no hay nada que registrar para que el módulo exista.
--
-- Plantillas (tabla roles): NO se toca ninguna. El dueño asigna el módulo
-- desde Admin (usuarios o plantillas) cuando termine la homologación; hasta
-- entonces solo el admin (bypass) lo ve. Mismo motivo por el que no se asigna
-- a usuarios concretos: la fase 1 es solo homologación.
--
-- Esta migración deja la capa de permisos EN LA BASE que usan las RPC de
-- 20260924c (defensa en profundidad, como `_pagos_flag`): aunque el backend ya
-- chequea con requireFlag, emitir y registrar vuelven a validar el flag acá.
-- =====================================================================

create or replace function public._ventas_es_admin(p_user_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce((select p.rol = 'admin' and coalesce(p.activo, true) from public.profiles p where p.id = p_user_id), false)
$$;

-- Espejo en SQL de flag('facturacion', …) del backend. Admin activo → true.
-- El coalesce de AFUERA no es decorativo (lección de _pagos_flag, 20260921f):
-- sin fila el subselect da NULL y un `if not …` no entraría por ninguna rama.
create or replace function public._ventas_flag(p_user_id uuid, p_flag text, p_default boolean default false)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((
    select case
             when coalesce(p.activo, true) = false then false
             when p.rol = 'admin'                  then true
             when p.permisos -> 'facturacion' ? p_flag
               then coalesce((p.permisos -> 'facturacion' ->> p_flag)::boolean, p_default)
             else p_default
           end
      from public.profiles p
     where p.id = p_user_id
  ), false)
$$;

comment on function public._ventas_flag(uuid, text, boolean) is
  'Flag de permisos.facturacion del usuario (admin activo = true, inactivo o inexistente = false). Espejo del backend.';

revoke all on function public._ventas_es_admin(uuid)             from public, anon, authenticated;
revoke all on function public._ventas_flag(uuid, text, boolean)  from public, anon, authenticated;
grant execute on function public._ventas_es_admin(uuid)            to service_role;
grant execute on function public._ventas_flag(uuid, text, boolean) to service_role;
