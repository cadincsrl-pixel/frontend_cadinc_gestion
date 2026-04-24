-- =====================================================================
-- Hardening del bucket `remitos-logistica` (público).
--
-- Antes: file_size_limit=NULL, allowed_mime_types=NULL → cualquier
-- autenticado podía subir binarios arbitrarios (ejecutables, malware,
-- archivos gigantes) al bucket público.
--
-- Ahora: restricción server-side de mime y tamaño. Cubre incluso si el
-- cliente es modificado o si alguien llama la Storage API directo con
-- anon key.
--
-- Tipos: imágenes (JPG/PNG/WEBP/HEIC/HEIF) y PDF.
-- Tamaño: 8 MB (coincide con el límite del frontend y el uso real
-- esperado de fotos/PDFs de remitos).
-- =====================================================================

update storage.buckets
set
  file_size_limit    = 8388608,  -- 8 MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
where id = 'remitos-logistica';
