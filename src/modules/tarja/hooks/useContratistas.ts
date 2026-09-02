import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/lib/api/client'
import type { Contratista, Certificacion, AsigContratista, Presupuesto } from '@/types/domain.types'

export const CONTRAT_KEY = ['contratistas'] as const

// Key de la query global GET /cert/all. Hoy la consumen (inline) CierresSection,
// TarjaObraPage, TarjaResumenPage, TarjaTopbarActions, CostosOficinaTab y
// ResumenHistoricoPage. Se exporta para que toda mutation de certificación la
// invalide: antes esas 6 pantallas quedaban stale 60 s después de certificar.
export const CERTS_ALL_KEY = ['certs', 'all'] as const

// ──────────────────────────── Errores del backend ────────────────────────────
// Códigos que devuelve /api/contratistas en el body `{ error, code }`. El
// mensaje legible viene en `error` (lo extrae mensajeError del panel); el
// código sirve para decidir UI (ej. ASIG_CON_HISTORIAL → ofrecer "Finalizar").
export type ContratErrorCode =
  | 'TITULO_DUPLICADO'        // POST /presupuestos: título repetido en el par obra×contratista
  | 'ASIG_FINALIZADA'         // POST /presupuestos, PUT /cert: el contratista está finalizado en la obra
  | 'PRESUPUESTO_CON_CERTS'   // DELETE /presupuestos/:id: body trae { n }
  | 'PRESUPUESTO_INVALIDO'    // PUT/PATCH cert: el presupuesto no es del par obra×contratista
  | 'PRESUPUESTO_CERRADO'     // PUT/PATCH cert: el presupuesto está cerrado
  | 'PRESUPUESTO_REQUERIDO'   // PUT/PATCH cert: hay presupuestos abiertos, no se acepta null
  | 'CERT_DUPLICADA'          // PATCH /cert/:id: el destino ya tiene cert esa semana
  | 'ASIG_CON_HISTORIAL'      // DELETE /asig: body trae { certs, presupuestos }

const CONTRAT_ERROR_CODES: readonly ContratErrorCode[] = [
  'TITULO_DUPLICADO', 'ASIG_FINALIZADA', 'PRESUPUESTO_CON_CERTS',
  'PRESUPUESTO_INVALIDO', 'PRESUPUESTO_CERRADO', 'PRESUPUESTO_REQUERIDO',
  'CERT_DUPLICADA', 'ASIG_CON_HISTORIAL',
]

// Devuelve el `code` del body del HttpError si es uno de los conocidos, o null.
export function codigoErrorContrat(err: unknown): ContratErrorCode | null {
  const body = (err as { body?: { code?: unknown } } | null)?.body
  const code = body?.code
  return typeof code === 'string' && (CONTRAT_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ContratErrorCode)
    : null
}

// Los GET de montos (certificaciones, presupuestos) responden 403 a quien no
// tiene ver_costos (capataz). Para esa persona la lista simplemente está vacía:
// no es un error que mostrar ni reintentar. Otros errores se propagan.
async function apiGetOVacioSi403<T>(path: string): Promise<T[]> {
  try {
    return await apiGet<T[]>(path)
  } catch (err) {
    if ((err as { status?: number }).status === 403) return []
    throw err
  }
}

// Toda mutation de certificación invalida el módulo Y la query global.
function invalidarCertificaciones(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: CONTRAT_KEY })
  qc.invalidateQueries({ queryKey: CERTS_ALL_KEY })
}

// ──────────────────────────────── Contratistas ───────────────────────────────

export function useContratistas() {
  return useQuery({
    queryKey: CONTRAT_KEY,
    queryFn:  () => apiGet<Contratista[]>('/api/contratistas'),
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

export function useDeleteContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/contratistas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// ───────────────────────── Asignación obra×contratista ───────────────────────

// Activos primero, luego finalizados (orden del backend).
export function useContratistasObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'asig', obraCod],
    queryFn:  () => apiGet<AsigContratista[]>(`/api/contratistas/asig/${encodeURIComponent(obraCod)}`),
    enabled:  !!obraCod,
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

// Finalizar (true) o reactivar (false) al contratista en la obra. No borra
// nada: el finalizado no se ofrece al certificar y su card se colapsa.
export function useFinalizarAsig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, contratId, finalizado }: {
      obraCod: string
      contratId: number
      finalizado: boolean
    }) =>
      apiPatch<AsigContratista>(
        `/api/contratistas/asig/${encodeURIComponent(obraCod)}/${contratId}`,
        { finalizado },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// Borra la asignación solo si el par no tiene historial. Con certificaciones
// o presupuestos el backend responde 409 ASIG_CON_HISTORIAL { certs, presupuestos }
// → ofrecer useFinalizarAsig en su lugar.
export function useDesasignarContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, contratId }: { obraCod: string; contratId: number }) =>
      apiDelete<{ success: true }>(`/api/contratistas/asig/${encodeURIComponent(obraCod)}/${contratId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// ──────────────────────────────── Presupuestos ───────────────────────────────

export interface PresupuestoCreateDto {
  obra_cod:   string
  contrat_id: number
  titulo:     string
  monto:      number          // > 0
  fecha?:     string          // YYYY-MM-DD, default hoy en el backend
  obs?:       string | null
}

// `cerrado: true` cierra (cerrado_en = now()), `false` reabre (cerrado_en = null).
export interface PresupuestoUpdateDto {
  titulo?:  string
  monto?:   number
  fecha?:   string
  obs?:     string | null
  cerrado?: boolean
}

// Abiertos primero, luego fecha asc, id asc (orden del backend).
// Capataz sin ver_costos → 403 → [].
export function usePresupuestosObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'presup', obraCod],
    queryFn:  () => apiGetOVacioSi403<Presupuesto>(
      `/api/contratistas/presupuestos/${encodeURIComponent(obraCod)}`,
    ),
    enabled:  !!obraCod,
  })
}

export function useCreatePresupuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: PresupuestoCreateDto) =>
      apiPost<Presupuesto>('/api/contratistas/presupuestos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useUpdatePresupuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: PresupuestoUpdateDto }) =>
      apiPatch<Presupuesto>(`/api/contratistas/presupuestos/${id}`, dto),
    // presupuesto_titulo viaja embebido en cada cert → también la query global.
    onSuccess: () => invalidarCertificaciones(qc),
  })
}

// 409 PRESUPUESTO_CON_CERTS { n } si tiene certificaciones imputadas.
export function useDeletePresupuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ success: true }>(`/api/contratistas/presupuestos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// ─────────────────────────────── Certificaciones ─────────────────────────────

// Sin `estado`: el certificado se paga sí o sí el viernes de cobro
// (getViernesCobro(sem_key)). `presupuesto_id` null/ausente = sin presupuesto,
// solo válido si el contratista no tiene presupuestos abiertos en la obra
// (400 PRESUPUESTO_REQUERIDO si tiene).
export interface CertificacionUpsertDto {
  obra_cod:        string
  contrat_id:      number
  sem_key:         string     // ISO del viernes (getViernes)
  monto:           number     // >= 0
  desc?:           string
  presupuesto_id?: number | null
}

export interface CertificacionUpdateDto {
  monto?:          number
  desc?:           string
  presupuesto_id?: number | null   // reimputar
}

// Capataz sin ver_costos → 403 → [].
export function useCertificacionesObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'cert', obraCod],
    queryFn:  () => apiGetOVacioSi403<Certificacion>(
      `/api/contratistas/cert/${encodeURIComponent(obraCod)}`,
    ),
    enabled:  !!obraCod,
  })
}

// Todas las certificaciones (todas las obras). Centraliza la query que hoy las
// 6 pantallas globales definen inline con la misma key.
export function useCertificacionesAll() {
  return useQuery({
    queryKey: CERTS_ALL_KEY,
    queryFn:  () => apiGet<Certificacion[]>('/api/contratistas/cert/all'),
  })
}

// Upsert por tupla (obra, contratista, semana, presupuesto): volver a cargar
// contra el mismo presupuesto la misma semana reemplaza el monto. Hasta la
// fase 2 (drop de la UNIQUE vieja) la 2da cert de la misma semana para otro
// presupuesto responde 409.
export function useUpsertCertificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CertificacionUpsertDto) =>
      apiPut<Certificacion>('/api/contratistas/cert', dto),
    onSuccess: () => invalidarCertificaciones(qc),
  })
}

// Corregir monto/desc o reimputar a otro presupuesto sin borrar y recrear.
export function useUpdateCertificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: CertificacionUpdateDto }) =>
      apiPatch<Certificacion>(`/api/contratistas/cert/${id}`, dto),
    onSuccess: () => invalidarCertificaciones(qc),
  })
}

// Reemplaza al viejo "poner en $0".
export function useDeleteCertificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ success: true }>(`/api/contratistas/cert/${id}`),
    onSuccess: () => invalidarCertificaciones(qc),
  })
}

// ──────────────────── Adjuntos (DNI del contratista, doc del presupuesto) ────────────────────
// Flujo de 2 pasos idéntico al de la póliza del seguro de máquinas
// (useAlquiler.useUploadSeguroPoliza): upload-url → PUT al signed URL → registrar.
// El PUT al signed URL es el único fetch directo permitido (va a Storage, no al backend).

// Tipos/límite permitidos por el backend (mismos para DNI y doc de presupuesto).
// Se valida en el cliente antes de subir para dar feedback inmediato (el
// backend revalida igual).
const DNI_MIME_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
] as const
const DNI_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// Lanza un Error con mensaje legible si el archivo no cumple. Reutilizable
// desde el componente para validar antes de disparar la mutation (DNI y
// adjunto de presupuesto comparten reglas).
export function validarArchivoDni(file: File): void {
  if (!DNI_MIME_PERMITIDOS.includes(file.type as (typeof DNI_MIME_PERMITIDOS)[number])) {
    throw new Error('Tipo de archivo no permitido. Subí una imagen (JPG/PNG/WEBP/HEIC) o PDF.')
  }
  if (file.size > DNI_MAX_BYTES) {
    throw new Error('El archivo supera los 10 MB.')
  }
}

interface DocUploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
}

// Sube el archivo al signed URL y devuelve el body para registrarlo en el backend.
async function subirAStorage(base: string, file: File) {
  validarArchivoDni(file)
  const up = await apiPost<DocUploadUrlResponse>(`${base}/upload-url`, {
    nombre_archivo: file.name,
    mime_type:      file.type,
    size_bytes:     file.size,
  })
  const putRes = await fetch(up.signed_url, {
    method: 'PUT', body: file, headers: { 'content-type': file.type },
  })
  if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
  return {
    storage_path:   up.path,
    nombre_archivo: file.name,
    mime_type:      file.type,
    size_bytes:     file.size,
  }
}

// ── DNI del contratista ──

export function useUploadDniContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratId, file }: { contratId: number; file: File }) => {
      const base = `/api/contratistas/${contratId}/dni`
      const body = await subirAStorage(base, file)
      return apiPost<Contratista>(base, body)
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

// ── Adjunto del presupuesto (foto/PDF) ──
// Necesita el id → en el modal de presupuesto el adjunto se habilita después
// de guardar. Subir de nuevo reemplaza el anterior.

export function useUploadPresupuestoDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ presupuestoId, file }: { presupuestoId: number; file: File }) => {
      const base = `/api/contratistas/presupuestos/${presupuestoId}/doc`
      const body = await subirAStorage(base, file)
      return apiPost<Presupuesto>(base, body)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDeletePresupuestoDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ presupuestoId }: { presupuestoId: number }) =>
      apiDelete<Presupuesto>(`/api/contratistas/presupuestos/${presupuestoId}/doc`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

// URL firmada para ver/descargar el adjunto del presupuesto. 404 si no tiene.
export async function fetchPresupuestoDocSignedUrl(presupuestoId: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/contratistas/presupuestos/${presupuestoId}/doc/signed-url`,
  )
  return data.url
}
