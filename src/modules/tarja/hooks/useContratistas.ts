import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { Contratista, Certificacion } from '@/types/domain.types'

export const CONTRAT_KEY = ['contratistas'] as const

export function useContratistas() {
  return useQuery({
    queryKey: CONTRAT_KEY,
    queryFn:  () => apiGet<Contratista[]>('/api/contratistas'),
  })
}

export function useContratistasObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'asig', obraCod],
    queryFn:  () => apiGet<Array<{ contrat_id: number; contratistas: Contratista }>>(`/api/contratistas/asig/${encodeURIComponent(obraCod)}`),
    enabled:  !!obraCod,
  })
}

export function useCertificacionesObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'cert', obraCod],
    queryFn:  () => apiGet<Certificacion[]>(`/api/contratistas/cert/${encodeURIComponent(obraCod)}`),
    enabled:  !!obraCod,
  })
}

export function useCreateContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Contratista, 'id'>) =>
      apiPost<Contratista>('/api/contratistas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useUpdateContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Contratista> }) =>
      apiPatch<Contratista>(`/api/contratistas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useAsignarContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { obra_cod: string; contrat_id: number }) =>
      apiPost('/api/contratistas/asig', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDesasignarContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, contratId }: { obraCod: string; contratId: number }) =>
      apiDelete(`/api/contratistas/asig/${encodeURIComponent(obraCod)}/${contratId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useUpsertCertificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: {
      obra_cod: string
      contrat_id: number
      sem_key: string
      monto: number
      desc?: string
      estado?: 'pendiente' | 'cerrado'
    }) => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = session
        ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
        : {}
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const res = await fetch(`${API_URL}/api/contratistas/cert`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(dto),
      })
      if (!res.ok) throw new Error(`PUT /api/contratistas/cert → ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDeleteContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/contratistas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// ──────────────────── Documento de DNI del contratista ────────────────────
// Flujo de 2 pasos idéntico al de la póliza del seguro de máquinas
// (useAlquiler.useUploadSeguroPoliza): upload-url → PUT al signed URL → registrar.

// Tipos/límite permitidos por el backend. Se valida en el cliente antes de
// subir para dar feedback inmediato (el backend revalida igual).
const DNI_MIME_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
] as const
const DNI_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// Lanza un Error con mensaje legible si el archivo no cumple. Reutilizable
// desde el componente para validar antes de disparar la mutation.
export function validarArchivoDni(file: File): void {
  if (!DNI_MIME_PERMITIDOS.includes(file.type as (typeof DNI_MIME_PERMITIDOS)[number])) {
    throw new Error('Tipo de archivo no permitido. Subí una imagen (JPG/PNG/WEBP/HEIC) o PDF.')
  }
  if (file.size > DNI_MAX_BYTES) {
    throw new Error('El archivo supera los 10 MB.')
  }
}

interface DniUploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
}

export function useUploadDniContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratId, file }: { contratId: number; file: File }) => {
      validarArchivoDni(file)
      const up = await apiPost<DniUploadUrlResponse>(
        `/api/contratistas/${contratId}/dni/upload-url`,
        {
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )
      const putRes = await fetch(up.signed_url, {
        method: 'PUT', body: file, headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      return apiPost<Contratista>(
        `/api/contratistas/${contratId}/dni`,
        {
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDeleteDniContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contratId }: { contratId: number }) =>
      apiDelete<Contratista>(`/api/contratistas/${contratId}/dni`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// Devuelve la URL firmada para ver/descargar el DNI adjunto (abrir en nueva
// pestaña). El backend tira 404 si el contratista no tiene DNI adjunto.
export async function fetchDniContratistaSignedUrl(contratId: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/contratistas/${contratId}/dni/signed-url`,
  )
  return data.url
}
