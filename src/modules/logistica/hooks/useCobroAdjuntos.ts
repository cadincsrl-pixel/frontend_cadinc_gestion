import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import { LOG_KEYS } from './useLogistica'
import type { CargarChequesRes, ChequeAManoInput, ChequeRecibido, CobroAdjunto, CobroAdjuntoTipo } from '@/types/domain.types'

export const COBRO_ADJ_KEY = ['cobros', 'adjuntos'] as const

/** Un 'leyendo' de más de 5 minutos se da por caído (igual que el backend). */
export function leyendoCheques(a: Pick<CobroAdjunto, 'cheques_lectura' | 'cheques_lectura_at'>): boolean {
  return a.cheques_lectura === 'leyendo' && !!a.cheques_lectura_at
    && Date.now() - new Date(a.cheques_lectura_at).getTime() < 5 * 60_000
}

export function useCobroAdjuntos(cobroId: number | null) {
  return useQuery({
    queryKey: [...COBRO_ADJ_KEY, cobroId],
    queryFn:  () => apiGet<CobroAdjunto[]>(`/api/logistica/cobros/${cobroId}/adjuntos`),
    enabled:  !!cobroId,
    staleTime: 30_000,
    // Mientras se leen los cheques de un adjunto (20260930j), se refresca
    // cada 4 s para mostrar cuándo termina.
    refetchInterval: q => (q.state.data ?? []).some(leyendoCheques) ? 4000 : false,
    // También con la pestaña en segundo plano: dura lo que dura la lectura
    // (menos de un minuto) y es lo que avisa que terminó.
    refetchIntervalInBackground: true,
  })
}

// ── Cheques recibidos del cobro (cartera, 20260930h/j) ──

export const COBRO_CHEQUES_KEY = ['cobros', 'cheques'] as const

export function useChequesDelCobro(cobroId: number | null, leyendo: boolean) {
  return useQuery({
    queryKey: [...COBRO_CHEQUES_KEY, cobroId],
    queryFn:  () => apiGet<ChequeRecibido[]>(`/api/logistica/cobros/${cobroId}/cheques`),
    enabled:  !!cobroId,
    staleTime: 30_000,
    refetchInterval: leyendo ? 4000 : false,
    refetchIntervalInBackground: true,
  })
}

export function useReleerCheques() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cobroId, id }: { cobroId: number; id: number }) =>
      apiPost<{ success: boolean }>(`/api/logistica/cobros/${cobroId}/adjuntos/${id}/leer-cheques`, {}),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [...COBRO_ADJ_KEY, v.cobroId] }),
  })
}

export function useCargarChequesAMano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cobroId, cheques }: { cobroId: number; cheques: ChequeAManoInput[] }) =>
      apiPost<CargarChequesRes>(`/api/logistica/cobros/${cobroId}/cheques`, { cheques }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [...COBRO_CHEQUES_KEY, v.cobroId] }),
  })
}

interface UploadInput {
  cobroId: number
  file:    File
  tipo:    CobroAdjuntoTipo
  obs?:    string
  // Invalidar además la lista de cobros (de ahí salen los chips documentales
  // de cada fila). Default true; se pasa false cuando el que llama sube en
  // tanda y ya invalida la lista al final — si no, son N×R refetch de una
  // query pesada de los que solo sirve el último.
  invalidarLista?: boolean
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       CobroAdjuntoTipo
}

export function useUploadCobroAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cobroId, file, tipo, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `/api/logistica/cobros/${cobroId}/adjuntos/upload-url`,
        { tipo, nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size },
      )
      const putRes = await fetch(up.signed_url, {
        method: 'PUT', body: file, headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      const adj = await apiPost<CobroAdjunto>(
        `/api/logistica/cobros/${cobroId}/adjuntos`,
        {
          tipo, storage_path: up.path,
          nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size,
          obs: obs ?? undefined,
        },
      )
      return adj
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...COBRO_ADJ_KEY, vars.cobroId] })
      // La fila del cobro trae los adjuntos embebidos y de ahí salen sus chips
      // documentales (comprobante / retenciones / contra factura): sin esto el
      // chip queda viejo hasta que otra cosa invalide la lista.
      if (vars.invalidarLista !== false) {
        qc.invalidateQueries({ queryKey: LOG_KEYS.cobros })
      }
    },
  })
}

export async function fetchCobroAdjSignedUrl(cobroId: number, id: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/logistica/cobros/${cobroId}/adjuntos/${id}/signed-url`,
  )
  return data.url
}

export function useDeleteCobroAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cobroId, id }: { cobroId: number; id: number }) =>
      apiDelete<{ success: boolean; id: number }>(
        `/api/logistica/cobros/${cobroId}/adjuntos/${id}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...COBRO_ADJ_KEY, vars.cobroId] })
      qc.invalidateQueries({ queryKey: LOG_KEYS.cobros })
    },
  })
}
