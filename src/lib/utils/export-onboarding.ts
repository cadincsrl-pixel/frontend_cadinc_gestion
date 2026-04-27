import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { apiGet } from '@/lib/api/client'
import type {
  Chofer, Camion, Batea,
  ChoferDocumento, ChoferDocTipo,
  VehiculoDocumento, VehiculoDocTipo,
} from '@/types/domain.types'

const DEFAULT_CHOFER_TIPOS: ChoferDocTipo[] = ['dni', 'licencia_conducir']
const DEFAULT_VEHICULO_TIPOS: VehiculoDocTipo[] = ['tarjeta_verde', 'rto', 'poliza_seguro']

const LABEL_CHOFER_TIPOS: Record<ChoferDocTipo, string> = {
  dni:                 'DNI',
  licencia_conducir:   'Licencia',
  alta_temprana:       'Alta_temprana',
  lnh:                 'LNH',
  cnrt:                'CNRT',
  aptitud_psicofisica: 'Aptitud_psicofisica',
  art:                 'ART',
  mopp:                'MOPP',
  cuil_afip:           'CUIL_AFIP',
  cbu_bancario:        'CBU',
  telegrama:           'Telegrama',
  otro:                'Otro',
}

const LABEL_VEHICULO_TIPOS: Record<VehiculoDocTipo, string> = {
  titulo:        'Titulo',
  tarjeta_verde: 'Tarjeta_verde',
  rto:           'RTO',
  poliza_seguro: 'Poliza_seguro',
}

export { DEFAULT_CHOFER_TIPOS, DEFAULT_VEHICULO_TIPOS, LABEL_CHOFER_TIPOS, LABEL_VEHICULO_TIPOS }

// Sanitiza un nombre de carpeta o archivo: caracteres ascii seguros.
function safeName(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // saca acentos
    .replace(/[^a-zA-Z0-9._-]+/g, '_')                      // solo ascii safe
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
    || 'sin_nombre'
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// Extrae extensión de un mime type para el nombre del archivo.
function extFromDoc(d: { mime_type: string; nombre_archivo: string }): string {
  const m = d.mime_type
  if (m === 'application/pdf') return 'pdf'
  if (m === 'image/jpeg') return 'jpg'
  if (m === 'image/png')  return 'png'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/heic') return 'heic'
  if (m === 'image/heif') return 'heif'
  // Fallback al sufijo del nombre original
  const dot = d.nombre_archivo.lastIndexOf('.')
  return dot >= 0 ? d.nombre_archivo.slice(dot + 1).toLowerCase() : 'bin'
}

// ── Tipos del paquete ──

export interface ExportOnboardingInput {
  choferes:        Chofer[]
  camiones:        Camion[]
  bateas:          Batea[]
  tiposChofer:     ChoferDocTipo[]
  tiposVehiculo:   VehiculoDocTipo[]
  empresa:         string                 // nombre de la empresa destinataria
  incluirResumen:  boolean
  onProgress?:     (info: { hechos: number; total: number; etapa: string }) => void
}

export interface ExportOnboardingResult {
  blob:        Blob
  filename:    string
  errores:     string[]                   // archivos que fallaron
}

// ── Función principal ──

export async function exportarPaqueteOnboarding(
  input: ExportOnboardingInput,
): Promise<ExportOnboardingResult> {
  const zip = new JSZip()
  const errores: string[] = []

  // 1) Pedir docs de cada chofer/camión/batea seleccionado.
  const onProgress = input.onProgress ?? (() => {})

  // Estimación inicial del total de archivos a procesar (para el progress).
  // Hacemos primero un round de fetches para conocer cuántos docs hay
  // efectivamente. Si el usuario tiene muchas entidades, esto puede tardar
  // un poco, pero es necesario para el progreso real.
  onProgress({ hechos: 0, total: 0, etapa: 'Listando documentos…' })

  type ChoferConDocs = { chofer: Chofer; docs: ChoferDocumento[] }
  type VehiculoConDocs = {
    entidad: 'camion' | 'batea'
    nombre: string                                 // patente
    id: number
    docs: VehiculoDocumento[]
  }

  const choferesDocs: ChoferConDocs[] = []
  const vehiculosDocs: VehiculoConDocs[] = []

  for (const c of input.choferes) {
    try {
      const docs = await apiGet<ChoferDocumento[]>(`/api/logistica/choferes/${c.id}/documentos`)
      const filtrados = docs.filter(d => input.tiposChofer.includes(d.tipo))
      choferesDocs.push({ chofer: c, docs: filtrados })
    } catch (e) {
      errores.push(`Chofer "${c.nombre}" — no se pudieron listar docs: ${(e as Error).message}`)
      choferesDocs.push({ chofer: c, docs: [] })
    }
  }

  for (const cam of input.camiones) {
    try {
      const docs = await apiGet<VehiculoDocumento[]>(`/api/logistica/camiones/${cam.id}/documentos`)
      const filtrados = docs.filter(d => input.tiposVehiculo.includes(d.tipo))
      vehiculosDocs.push({ entidad: 'camion', nombre: cam.patente, id: cam.id, docs: filtrados })
    } catch (e) {
      errores.push(`Camión "${cam.patente}" — no se pudieron listar docs: ${(e as Error).message}`)
      vehiculosDocs.push({ entidad: 'camion', nombre: cam.patente, id: cam.id, docs: [] })
    }
  }

  for (const b of input.bateas) {
    try {
      const docs = await apiGet<VehiculoDocumento[]>(`/api/logistica/bateas/${b.id}/documentos`)
      const filtrados = docs.filter(d => input.tiposVehiculo.includes(d.tipo))
      vehiculosDocs.push({ entidad: 'batea', nombre: b.patente, id: b.id, docs: filtrados })
    } catch (e) {
      errores.push(`Batea "${b.patente}" — no se pudieron listar docs: ${(e as Error).message}`)
      vehiculosDocs.push({ entidad: 'batea', nombre: b.patente, id: b.id, docs: [] })
    }
  }

  const totalArchivos =
    choferesDocs.reduce((n, c) => n + c.docs.length, 0) +
    vehiculosDocs.reduce((n, v) => n + v.docs.length, 0)
  let hechos = 0

  // 2) Resumen Excel.
  if (input.incluirResumen) {
    onProgress({ hechos, total: totalArchivos, etapa: 'Generando resumen Excel…' })
    const wb = XLSX.utils.book_new()

    // Hoja Choferes
    const wsChof = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'CUIL', 'Teléfono', 'Licencia', 'Estado', 'Camión asignado', 'Obs'],
      ...input.choferes.map(c => {
        const camion = input.camiones.find(cam => cam.id === c.camion_id)
        return [c.nombre, c.cuil ?? '', c.tel ?? '', c.licencia ?? '', c.estado, camion?.patente ?? '', c.obs ?? '']
      }),
    ])
    wsChof['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsChof, 'Choferes')

    // Hoja Camiones
    const wsCam = XLSX.utils.aoa_to_sheet([
      ['Patente', 'Modelo', 'Año', 'Estado', 'Obs'],
      ...input.camiones.map(c => [c.patente, c.modelo ?? '', c.anio ?? '', c.estado, c.obs ?? '']),
    ])
    wsCam['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsCam, 'Camiones')

    // Hoja Bateas
    const wsBat = XLSX.utils.aoa_to_sheet([
      ['Patente', 'Tipo', 'Marca', 'Modelo', 'Año', 'Capacidad m³', 'Capacidad tn', 'Titular', 'Estado', 'Obs'],
      ...input.bateas.map(b => [
        b.patente, b.tipo ?? '', b.marca ?? '', b.modelo ?? '', b.anio ?? '',
        b.capacidad_m3 ?? '', b.capacidad_tn ?? '', b.titular ?? '', b.estado, b.obs ?? '',
      ]),
    ])
    wsBat['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsBat, 'Bateas')

    const xlsxBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    zip.file('resumen.xlsx', xlsxBuffer)
  }

  // 3) Descargar y zippear archivos de cada chofer.
  for (const { chofer, docs } of choferesDocs) {
    if (docs.length === 0) continue
    const carpeta = `choferes/${safeName(chofer.nombre)}_${safeName(chofer.cuil ?? '')}`
    for (const doc of docs) {
      onProgress({ hechos, total: totalArchivos, etapa: `Chofer: ${doc.nombre_archivo}` })
      try {
        const url = await fetchSignedUrlChofer(chofer.id, doc.id)
        const blob = await fetchBlob(url)
        const fechaVto = doc.vence_el ? `_vto_${fmtFecha(doc.vence_el)}` : ''
        const nombre = `${LABEL_CHOFER_TIPOS[doc.tipo]}${fechaVto}.${extFromDoc(doc)}`
        zip.file(`${carpeta}/${safeName(nombre)}`, blob)
      } catch (e) {
        errores.push(
          `Chofer "${chofer.nombre}" / "${doc.nombre_archivo}" — ${(e as Error).message}`,
        )
      }
      hechos++
    }
  }

  // 4) Descargar y zippear archivos de cada vehículo.
  for (const { entidad, nombre: patente, id, docs } of vehiculosDocs) {
    if (docs.length === 0) continue
    const carpeta = `${entidad === 'camion' ? 'camiones' : 'bateas'}/${safeName(patente)}`
    for (const doc of docs) {
      onProgress({ hechos, total: totalArchivos, etapa: `${entidad === 'camion' ? 'Camión' : 'Batea'} ${patente}: ${doc.nombre_archivo}` })
      try {
        const url = await fetchSignedUrlVehiculo(entidad, id, doc.id)
        const blob = await fetchBlob(url)
        const fechaVto = doc.vence_el ? `_vto_${fmtFecha(doc.vence_el)}` : ''
        const nombre = `${LABEL_VEHICULO_TIPOS[doc.tipo]}${fechaVto}.${extFromDoc(doc)}`
        zip.file(`${carpeta}/${safeName(nombre)}`, blob)
      } catch (e) {
        errores.push(
          `${entidad} "${patente}" / "${doc.nombre_archivo}" — ${(e as Error).message}`,
        )
      }
      hechos++
    }
  }

  // 5) Si hubo errores, los registramos en errores.txt.
  if (errores.length > 0) {
    zip.file('errores.txt', errores.join('\n'))
  }

  // 6) Generar blob final.
  onProgress({ hechos, total: totalArchivos, etapa: 'Comprimiendo ZIP…' })
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    metadata => {
      onProgress({ hechos, total: totalArchivos, etapa: `Comprimiendo… ${Math.round(metadata.percent)}%` })
    },
  )

  const empresa = safeName(input.empresa || 'paquete')
  const fecha = new Date().toISOString().slice(0, 10)
  const filename = `CADINC_paquete_${empresa}_${fecha}.zip`

  return { blob, filename, errores }
}

// ── Helpers internos para fetch de signed URLs y blobs ──

async function fetchSignedUrlChofer(choferId: number, docId: number): Promise<string> {
  const data = await apiGet<{ url: string }>(
    `/api/logistica/choferes/${choferId}/documentos/${docId}/signed-url`,
  )
  return data.url
}

async function fetchSignedUrlVehiculo(
  entidad: 'camion' | 'batea',
  id: number,
  docId: number,
): Promise<string> {
  const seg = entidad === 'camion' ? 'camiones' : 'bateas'
  const data = await apiGet<{ url: string }>(
    `/api/logistica/${seg}/${id}/documentos/${docId}/signed-url`,
  )
  return data.url
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

// ── Helper público para disparar la descarga ──

export function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
