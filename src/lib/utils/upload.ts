import { createClient } from '@/lib/supabase/client'

// Tipos MIME aceptados. Debe coincidir con el bucket config
// (allowed_mime_types en storage.buckets.remitos-logistica).
// La validación server-side del bucket es la defensa real; ésta es
// para UX (mensaje de error claro antes del round-trip).
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])

// Extensión canónica por mime. No confiamos en file.name.split('.').pop()
// porque el usuario podría renombrar un .exe como .jpg; además si el
// mime es correcto, la extensión adecuada es la derivada del mime.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg':       'jpg',
  'image/png':        'png',
  'image/webp':       'webp',
  'image/heic':       'heic',
  'image/heif':       'heif',
  'application/pdf':  'pdf',
}

const MAX_SIZE_BYTES = 8 * 1024 * 1024  // 8 MB — coincide con bucket

export class UploadValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export async function uploadRemitoImg(file: File, bucket = 'remitos-logistica'): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadValidationError(
      'Tipo de archivo no permitido. Se aceptan imágenes (JPG/PNG/WEBP/HEIC) y PDF.',
      'MIME_NO_PERMITIDO',
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    const mb = Math.floor(MAX_SIZE_BYTES / 1024 / 1024)
    throw new UploadValidationError(
      `Archivo demasiado grande (máx ${mb} MB).`,
      'ARCHIVO_GRANDE',
    )
  }

  const supabase = createClient()
  const ext = EXT_BY_MIME[file.type] ?? 'bin'
  const path = `remito_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
