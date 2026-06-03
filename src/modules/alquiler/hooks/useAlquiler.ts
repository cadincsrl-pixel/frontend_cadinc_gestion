'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type {
  Cliente,
  CuentaCorrienteCliente,
  Maquina,
  ObraAlquiler,
  ObraAlquilerDetalle,
  ObraMaquina,
  Parte,
  RemitoAlquiler,
  ReporteHoraMaquina,
} from '../types'

// ── Query keys (constantes, como el resto del proyecto) ──
export const CLIENTES_KEY = ['alquiler', 'clientes'] as const
export const MAQUINAS_KEY = ['alquiler', 'maquinas'] as const
export const OBRAS_KEY    = ['alquiler', 'obras'] as const
export const obraDetalleKey = (id: number) => ['alquiler', 'obras', id] as const
export const obraMaquinasKey = (obraId: number) => ['alquiler', 'obra-maquinas', obraId] as const

export interface PartesFiltro {
  obra_id?:    number
  maquina_id?: number
  desde?:      string
  hasta?:      string
}
export const partesKey = (f: PartesFiltro) => ['alquiler', 'partes', f] as const

// ── Perfiles (para selects de jefe de obra / maquinista) ──
export interface PerfilNombre {
  id:     string
  nombre: string
}
export function usePerfilesLista() {
  return useQuery({
    queryKey: ['perfiles-nombres'],
    queryFn:  () => apiGet<PerfilNombre[]>('/api/me/perfiles'),
    staleTime: 5 * 60 * 1000,
  })
}

// ─────────────────────────── Clientes ───────────────────────────
// Ficha de cliente para la cuenta corriente (Fase A). Las obras apuntan a un
// cliente vía cliente_id, por eso el update/delete invalidan también OBRAS_KEY
// (las obras muestran el nombre del cliente resuelto).
export function useClientes() {
  return useQuery({
    queryKey: CLIENTES_KEY,
    queryFn:  () => apiGet<Cliente[]>('/api/alquiler/clientes'),
  })
}

export function useCreateCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Cliente>) => apiPost<Cliente>('/api/alquiler/clientes', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: CLIENTES_KEY }),
  })
}

export function useUpdateCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Cliente> }) =>
      apiPatch<Cliente>(`/api/alquiler/clientes/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTES_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

export function useDeleteCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/clientes/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: CLIENTES_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// ─────────────────────────── Máquinas ───────────────────────────
export function useMaquinas() {
  return useQuery({
    queryKey: MAQUINAS_KEY,
    queryFn:  () => apiGet<Maquina[]>('/api/alquiler/maquinas'),
  })
}

export function useCreateMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Maquina>) => apiPost<Maquina>('/api/alquiler/maquinas', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MAQUINAS_KEY }),
  })
}

export function useUpdateMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Maquina> }) =>
      apiPatch<Maquina>(`/api/alquiler/maquinas/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      // Las obras embeben máquinas en su detalle → invalidar también.
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

export function useDeleteMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/maquinas/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// ──────────────────── Póliza del seguro de la máquina ────────────────────
// Mismo flujo de 2 pasos que los documentos de vehículo
// (useVehiculoDocumentos.ts): upload-url → PUT al signed URL → registrar.

// Tipos/límite permitidos por el backend. Se valida en el cliente antes de
// subir para dar feedback inmediato (el backend revalida igual).
const POLIZA_MIME_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
] as const
const POLIZA_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// Lanza un Error con mensaje legible si el archivo no cumple. Reutilizable
// desde el componente para validar antes de disparar la mutation.
export function validarArchivoPoliza(file: File): void {
  if (!POLIZA_MIME_PERMITIDOS.includes(file.type as (typeof POLIZA_MIME_PERMITIDOS)[number])) {
    throw new Error('Tipo de archivo no permitido. Subí una imagen (JPG/PNG/WEBP/HEIC) o PDF.')
  }
  if (file.size > POLIZA_MAX_BYTES) {
    throw new Error('El archivo supera los 10 MB.')
  }
}

interface SeguroPolizaUploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
}

export function useUploadSeguroPoliza() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ maquinaId, file }: { maquinaId: number; file: File }) => {
      validarArchivoPoliza(file)
      const up = await apiPost<SeguroPolizaUploadUrlResponse>(
        `/api/alquiler/maquinas/${maquinaId}/seguro-poliza/upload-url`,
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
      return apiPost<Maquina>(
        `/api/alquiler/maquinas/${maquinaId}/seguro-poliza`,
        {
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

export function useDeleteSeguroPoliza() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ maquinaId }: { maquinaId: number }) =>
      apiDelete<Maquina>(`/api/alquiler/maquinas/${maquinaId}/seguro-poliza`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// Devuelve la URL firmada para ver/descargar la póliza adjunta (abrir en
// nueva pestaña). El backend tira 404 si la máquina no tiene póliza.
export async function fetchSeguroPolizaSignedUrl(maquinaId: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/alquiler/maquinas/${maquinaId}/seguro-poliza`,
  )
  return data.url
}

// ─────────────────────────── Obras ───────────────────────────
export function useObrasAlquiler() {
  return useQuery({
    queryKey: OBRAS_KEY,
    queryFn:  () => apiGet<ObraAlquiler[]>('/api/alquiler/obras'),
  })
}

export function useObraAlquiler(id: number | null) {
  return useQuery({
    queryKey: obraDetalleKey(id ?? 0),
    queryFn:  () => apiGet<ObraAlquilerDetalle>(`/api/alquiler/obras/${id}`),
    enabled:  id != null,
  })
}

export function useCreateObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<ObraAlquiler>) => apiPost<ObraAlquiler>('/api/alquiler/obras', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useUpdateObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<ObraAlquiler> }) =>
      apiPatch<ObraAlquiler>(`/api/alquiler/obras/${id}`, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.id) })
    },
  })
}

export function useDeleteObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/obras/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

// ───────────────── Asignación máquina ↔ obra ─────────────────
export function useObraMaquinas(obraId: number | null) {
  return useQuery({
    queryKey: obraMaquinasKey(obraId ?? 0),
    queryFn:  () => apiGet<ObraMaquina[]>(`/api/alquiler/obras/${obraId}/maquinas`),
    enabled:  obraId != null,
  })
}

export function useAsignarMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraId, dto }: {
      obraId: number
      dto: { maquina_id: number; maquinista_leg?: string | null; precio_hora?: number | null }
    }) =>
      apiPost<ObraMaquina>(`/api/alquiler/obras/${obraId}/maquinas`, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// Actualiza una asignación máquina↔obra. El PATCH del backend es flexible:
// se manda solo lo que cambió (maquinista_leg y/o precio_hora). `obraId` solo
// se usa para invalidar las queries dependientes.
export function useUpdateObraMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: {
      id: number
      obraId: number
      dto: { maquinista_leg?: string | null; precio_hora?: number | null }
    }) =>
      apiPatch<ObraMaquina>(`/api/alquiler/obra-maquinas/${id}`, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
    },
  })
}

export function useDesasignarMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; obraId: number }) =>
      apiDelete(`/api/alquiler/obra-maquinas/${id}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// ─────────────────────────── Partes ───────────────────────────
function partesQueryString(f: PartesFiltro): string {
  const sp = new URLSearchParams()
  if (f.obra_id    != null) sp.set('obra_id', String(f.obra_id))
  if (f.maquina_id != null) sp.set('maquina_id', String(f.maquina_id))
  if (f.desde)              sp.set('desde', f.desde)
  if (f.hasta)              sp.set('hasta', f.hasta)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function usePartes(f: PartesFiltro, enabled = true) {
  return useQuery({
    queryKey: partesKey(f),
    queryFn:  () => apiGet<Parte[]>(`/api/alquiler/partes${partesQueryString(f)}`),
    enabled,
  })
}

export function useCreateParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Parte>) => apiPost<Parte>('/api/alquiler/partes', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

export function useUpdateParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Parte> }) =>
      apiPatch<Parte>(`/api/alquiler/partes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

export function useDeleteParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/partes/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

// ─────────────────────────── Remitos ───────────────────────────
export interface RemitosFiltro {
  obra_id?:    number
  maquina_id?: number
  desde?:      string
  hasta?:      string
}
export const remitosKey = (f: RemitosFiltro) => ['alquiler', 'remitos', f] as const

function remitosQueryString(f: RemitosFiltro): string {
  const sp = new URLSearchParams()
  if (f.obra_id    != null) sp.set('obra_id', String(f.obra_id))
  if (f.maquina_id != null) sp.set('maquina_id', String(f.maquina_id))
  if (f.desde)              sp.set('desde', f.desde)
  if (f.hasta)              sp.set('hasta', f.hasta)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function useRemitos(f: RemitosFiltro, enabled = true) {
  return useQuery({
    queryKey: remitosKey(f),
    queryFn:  () => apiGet<RemitoAlquiler[]>(`/api/alquiler/remitos${remitosQueryString(f)}`),
    enabled,
  })
}

// Emite o REFRESCA el remito de un parte (idempotente: conserva RA-NNNN).
export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (parteId: number) =>
      apiPost<RemitoAlquiler>(`/api/alquiler/partes/${parteId}/remito`, {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'remitos'] }),
  })
}

export function useDeleteRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/remitos/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'remitos'] }),
  })
}

// ─────────────────────────── Reportes ───────────────────────────
export interface ReporteHorasFiltro {
  obra_id?: number
  desde?:   string
  hasta?:   string
}
export const reporteHorasKey = (f: ReporteHorasFiltro) =>
  ['alquiler', 'reportes', 'horas', f] as const

function reporteHorasQueryString(f: ReporteHorasFiltro): string {
  const sp = new URLSearchParams()
  if (f.obra_id != null) sp.set('obra_id', String(f.obra_id))
  if (f.desde)           sp.set('desde', f.desde)
  if (f.hasta)           sp.set('hasta', f.hasta)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function useReporteHoras(f: ReporteHorasFiltro, enabled = true) {
  return useQuery({
    queryKey: reporteHorasKey(f),
    queryFn:  () => apiGet<ReporteHoraMaquina[]>(`/api/alquiler/reportes/horas${reporteHorasQueryString(f)}`),
    enabled,
  })
}

// ─────────────────────── Cuenta corriente (Fase B) ───────────────────────
// Devengado por cliente (horas × $/hora). Solo lectura. desde/hasta filtran
// por la fecha del parte ('YYYY-MM-DD'); cliente_id acota a un solo cliente.
export interface CuentaCorrienteFiltro {
  desde?:      string
  hasta?:      string
  cliente_id?: number
}
export const cuentaCorrienteKey = (f: CuentaCorrienteFiltro) =>
  ['alquiler', 'cuenta-corriente', f] as const

function cuentaCorrienteQueryString(f: CuentaCorrienteFiltro): string {
  const sp = new URLSearchParams()
  if (f.desde)              sp.set('desde', f.desde)
  if (f.hasta)              sp.set('hasta', f.hasta)
  if (f.cliente_id != null) sp.set('cliente_id', String(f.cliente_id))
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function useCuentaCorriente(f: CuentaCorrienteFiltro, enabled = true) {
  return useQuery({
    queryKey: cuentaCorrienteKey(f),
    queryFn:  () => apiGet<CuentaCorrienteCliente[]>(
      `/api/alquiler/cuenta-corriente${cuentaCorrienteQueryString(f)}`,
    ),
    enabled,
  })
}
