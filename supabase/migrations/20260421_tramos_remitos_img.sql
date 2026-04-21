-- =====================================================================
-- Tramos: URL de imagen del remito de carga y descarga
-- =====================================================================

alter table tramos
  add column if not exists remito_carga_img_url    text,
  add column if not exists remito_descarga_img_url text;
