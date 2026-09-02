-- =====================================================================
-- Contratistas: presupuestos múltiples — FASE 2b (limpieza).
-- Aplicar unos días después de verificar el panel nuevo en prod.
--   · certificaciones.estado: el certificado se paga sí o sí el viernes de
--     cobro; el estado pendiente/cerrado no encodeaba nada (213/8, nadie lo
--     leía; la columna "Estado" del Excel siempre fue la del cierre de semana).
--   · asig_contrat.cotizacion*: reemplazadas por contrat_presupuestos (la
--     única fila cargada se migró como presupuesto id 1 en la fase 1).
-- Sin dependencias: verificado 2026-09-01 que ninguna vista/función lee
-- estas columnas (la RPC certificaciones_de_obras es SETOF y se adapta).
-- =====================================================================
alter table public.certificaciones
  drop column if exists estado;

alter table public.asig_contrat
  drop column if exists cotizacion,
  drop column if exists cotizacion_obs,
  drop column if exists cotizacion_doc_path,
  drop column if exists cotizacion_doc_nombre,
  drop column if exists cotizacion_doc_mime,
  drop column if exists cotizacion_doc_size,
  drop column if exists cotizacion_doc_hash;
