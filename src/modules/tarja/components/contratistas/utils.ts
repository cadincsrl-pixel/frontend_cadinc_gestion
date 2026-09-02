import { getSemDays, getViernesCobro } from '@/lib/utils/dates'
import type {
  AsigContratista, Certificacion, Contratista, Presupuesto,
} from '@/types/domain.types'

// ─────────────────────────────── Formato ───────────────────────────────

// Montos en pesos (es-AR, sin decimales).
export function fmtMonto(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// 'YYYY-MM-DD' (o timestamptz) → Date anclada a mediodía local, para que el
// día no se corra por huso horario al formatear.
export function parseISOLocal(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`)
}

export function fmtDDMM(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

// "vie 28/08 → jue 03/09" para un sem_key (ISO del viernes).
export function rangoSemana(semKey: string): string {
  const days = getSemDays(parseISOLocal(semKey))
  return `vie ${fmtDDMM(days[0]!)} → jue ${fmtDDMM(days[6]!)}`
}

// "vie 04/09": viernes de cobro = sem_key + 7 (igual que los operarios).
export function fechaPago(semKey: string): string {
  return `vie ${fmtDDMM(getViernesCobro(parseISOLocal(semKey)))}`
}

// Mensaje legible de un HttpError (el client central ya extrae `error`/`message`
// del body al `message`), con fallback.
export function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string } | null)?.message
  return m || fallback
}

// Por qué un botón mutativo está deshabilitado (se muestra como `title`).
// null = se puede mutar.
export function motivoBloqueoMutacion(o: {
  readonly: boolean
  puedeEditar: boolean
  verPii: boolean
  finalizado?: boolean
}): string | null {
  if (o.readonly)    return 'Obra archivada: solo lectura'
  if (o.finalizado)  return 'Contratista finalizado en esta obra (reactivalo para editar)'
  if (!o.puedeEditar) return 'Sin permiso de edición en tarja'
  if (!o.verPii)     return 'Requiere el permiso "ver datos sensibles" (ver_pii) en tarja'
  return null
}

// ──────────────────────────── Resumen por card ─────────────────────────

export interface PresupuestoResumen {
  presupuesto: Presupuesto
  certificado: number      // Σ certs con este presupuesto_id (todas las semanas)
  saldo:       number      // monto − certificado (negativo = excedido)
  pct:         number      // certificado / monto × 100, sin tope
}

export interface ContratistaResumen {
  asig:        AsigContratista
  contratista: Contratista
  finalizado:  boolean
  /** Todas las certs del contratista en la obra, más reciente primero. */
  certs:       Certificacion[]
  /** Certs de la semana visualizada (0..N, una por presupuesto). */
  certsSemana: Certificacion[]
  presupuestos:         PresupuestoResumen[]
  presupuestosAbiertos: Presupuesto[]
  /** Certs sin presupuesto_id (histórico). */
  certificadoSinPresup: number
  tieneCertsSinPresup:  boolean
  totalPresupuestado:   number
  /** Σ todas las certs, incluidas las sin presupuesto. */
  totalCertificado:     number
  /** Σ saldos de los presupuestos (no incluye el bucket sin presupuesto). */
  totalSaldo:           number
  /** Con certs o presupuestos no se desasigna: se finaliza. */
  tieneHistorial:       boolean
}

export function resumirContratista(
  asig: AsigContratista,
  certificaciones: Certificacion[],
  presupuestosObra: Presupuesto[],
  semKey: string,
): ContratistaResumen {
  const certs = certificaciones
    .filter(c => c.contrat_id === asig.contrat_id)
    .sort((x, y) =>
      y.sem_key.localeCompare(x.sem_key)
      || (x.presupuesto_titulo ?? '').localeCompare(y.presupuesto_titulo ?? ''),
    )
  const certsSemana = certs.filter(c => c.sem_key === semKey)

  // El backend ya ordena abiertos primero, luego fecha asc, id asc.
  const presupuestos: PresupuestoResumen[] = presupuestosObra
    .filter(p => p.contrat_id === asig.contrat_id)
    .map(p => {
      const monto = Number(p.monto)
      const certificado = certs
        .filter(c => c.presupuesto_id === p.id)
        .reduce((acc, c) => acc + Number(c.monto), 0)
      return {
        presupuesto: p,
        certificado,
        saldo: monto - certificado,
        pct:   monto > 0 ? (certificado / monto) * 100 : 0,
      }
    })

  const certsSinPresup = certs.filter(c => c.presupuesto_id == null)
  const certificadoSinPresup = certsSinPresup.reduce((acc, c) => acc + Number(c.monto), 0)

  return {
    asig,
    contratista: asig.contratistas,
    finalizado:  asig.finalizado_en != null,
    certs,
    certsSemana,
    presupuestos,
    presupuestosAbiertos: presupuestos.filter(p => !p.presupuesto.cerrado_en).map(p => p.presupuesto),
    certificadoSinPresup,
    tieneCertsSinPresup: certsSinPresup.length > 0,
    totalPresupuestado:  presupuestos.reduce((acc, p) => acc + Number(p.presupuesto.monto), 0),
    totalCertificado:    certs.reduce((acc, c) => acc + Number(c.monto), 0),
    totalSaldo:          presupuestos.reduce((acc, p) => acc + p.saldo, 0),
    tieneHistorial:      certs.length > 0 || presupuestos.length > 0,
  }
}
