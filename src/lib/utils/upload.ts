import { createClient } from '@/lib/supabase/client'

export async function uploadRemitoImg(file: File, bucket = 'remitos-logistica'): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `remito_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
