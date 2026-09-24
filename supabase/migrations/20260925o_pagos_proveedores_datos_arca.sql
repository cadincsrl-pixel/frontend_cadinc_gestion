-- =====================================================================
-- Compras: datos de ARCA en el padrón de proveedores (2026-09-25)
--
-- Por qué: el dueño pidió que los proveedores se crucen con ARCA
-- (domicilio, provincia, condición frente al IVA, etc.), igual que los
-- clientes de Ventas. El backend consulta el padrón y guarda acá lo que
-- trae; también se puede cargar a mano.
--
-- Todo NULLABLE: hay proveedores sin CUIT o del exterior, y los 18 que
-- ya existen no tienen estos datos hasta que alguien los actualice.
--
-- condicion_iva_id usa el MISMO dominio que ventas_clientes.condicion_iva_id
-- (CHECK 1..16, los ids de condición IVA de ARCA; en el backend la const
-- CONDICIONES_IVA). No es FK porque en Ventas tampoco lo es: no hay tabla.
--
-- Módulo Pagos sigue independiente (§5.18): no hay FK ni cruce con
-- ventas_clientes, solo se replica el dominio.
-- =====================================================================

alter table public.pagos_proveedores
  add column domicilio            text,
  add column provincia            text,
  add column condicion_iva_id     smallint,
  add column tipo_persona         text,
  add column actividad_principal  text,
  add column padron_json          jsonb,
  add column padron_consultado_at timestamptz;

alter table public.pagos_proveedores
  add constraint pagos_proveedores_condicion_iva_id_check
  check (condicion_iva_id >= 1 and condicion_iva_id <= 16);
