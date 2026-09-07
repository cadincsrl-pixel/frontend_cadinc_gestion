import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { VehiculoDocumento, VehiculoDocTipo, VehiculoEntidad } from '@/types/domain.types'

export const VEH_DOCS_KEY = ['vehiculo-docs'] as const

// Endpoints sirven la misma estructura para camion y batea — solo cambia el
// path raíz: /api/logistica/{camiones|bateas}/:id/documentos/...
function basePath(entidad: VehiculoEntidad, id: number): string {
  const seg = entidad === 'camion' ? 'camiones' : 'bateas'
  return `/api/logistica/${seg}/${id}`
}

export function useVehiculoDocumentos(entidad: VehiculoEntidad, id: number | null) {
  return useQuery({
    queryKey: [...VEH_DOCS_KEY, entidad, id],
    queryFn:  () => apiGet<VehiculoDocumento[]>(`${basePath(entidad, id!)}/documentos`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

interface UploadInput {
  entidad:  VehiculoEntidad
  id:       number
  file:     File
  tipo:     VehiculoDocTipo
  vence_el?: string | null
  obs?:     string
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       VehiculoDocTipo
}

export function useUploadVehiculoDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entidad, id, file, tipo, vence_el, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `${basePath(entidad, id)}/documentos/upload-url`,
        {
          tipo,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )
      const putRes = await fetch(up.signed_url, {
        method: 'PUT', body: file, headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      const doc = await apiPost<VehiculoDocumento>(
        `${basePath(entidad, id)}/documentos`,
        {
          tipo,
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
          vence_el:       vence_el ?? undefined,
          obs:            obs ?? undefined,
        },
      )
      return doc
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...VEH_DOCS_KEY, vars.entidad, vars.id] })
    },
  })
}

export function useUpdateVehiculoDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { entidad, id, docId, vence_el, obs }:
      { entidad: VehiculoEntidad; id: number; docId: number; vence_el?: string | null; obs?: string | null }
    ) =>
      apiPatch<VehiculoDocumento>(
        `${basePath(entidad, id)}/documentos/${docId}`,
        { vence_el, obs },
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...VEH_DOCS_KEY, vars.entidad, vars.id] })
    },
  })
}

export async function fetchVehiculoDocSignedUrl(
  entidad: VehiculoEntidad, id: number, docId: number,
): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `${basePath(entidad, id)}/documentos/${docId}/signed-url`,
  )
  return data.url
}

export function useDeleteVehiculoDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { entidad, id, docId }: { entidad: VehiculoEntidad; id: number; docId: number }
    ) =>
      apiDelete<{ success: boolean; id: number }>(
        `${basePath(entidad, id)}/documentos/${docId}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...VEH_DOCS_KEY, vars.entidad, vars.id] })
    },
  })
}

// ── Helpers de vencimiento (mismo patrón que chofer) ──
export type EstadoVencimiento = 'sin_vto' | 'vigente' | 'por_vencer' | 'vencido'

export function calcularEstadoVencimiento(vence_el: string | null): {
  estado: EstadoVencimiento
  diasRestantes: number | null
} {
  if (!vence_el) return { estado: 'sin_vto', diasRestantes: null }
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaVto = new Date(vence_el + 'T00:00:00')
  const diff = Math.round((fechaVto.getTime() - hoy.getTime()) / 86_400_000)
  if (diff < 0)   return { estado: 'vencido',     diasRestantes: diff }
  if (diff <= 30) return { estado: 'por_vencer',  diasRestantes: diff }
  return            { estado: 'vigente',     diasRestantes: diff }
}
