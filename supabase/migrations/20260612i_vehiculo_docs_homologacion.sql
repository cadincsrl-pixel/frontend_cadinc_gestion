-- Logística — documentación de vehículos: tipos nuevos 'homologacion' y
-- 'registro_modificacion'. El registro de modificación son 2 PDFs: el
-- modelo ya permite N archivos por tipo (sin UNIQUE por tipo), así que
-- solo se amplía el CHECK en camiones y bateas.
ALTER TABLE camion_documentos DROP CONSTRAINT IF EXISTS camion_documentos_tipo_check;
ALTER TABLE camion_documentos
  ADD CONSTRAINT camion_documentos_tipo_check
  CHECK (tipo IN ('titulo','tarjeta_verde','rto','poliza_seguro','homologacion','registro_modificacion'));

ALTER TABLE batea_documentos DROP CONSTRAINT IF EXISTS batea_documentos_tipo_check;
ALTER TABLE batea_documentos
  ADD CONSTRAINT batea_documentos_tipo_check
  CHECK (tipo IN ('titulo','tarjeta_verde','rto','poliza_seguro','homologacion','registro_modificacion'));
