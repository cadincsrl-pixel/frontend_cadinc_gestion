// Matemática pura de tarifas de facturación (extraída de FacturacionTab.tsx
// para poder testearla — los tests de src/__tests__/tarifas.test.ts congelan
// estos números; si cambiás una fórmula acá, los tests van a gritar A PROPÓSITO).

import type { TarifaEmpresaCantera, Camion } from '@/types/domain.types'

// Las tarifas se GUARDAN como valor final (c/IVA) — así las consumen los
// cobros, el saldo y los PDFs. Pero los transportistas pasan la NETA, así
// que el form pide neta y el sistema calcula el final solo (IVA 21%).
// Los helpers viven en lib/utils/iva (también los usa la compra de materiales
// de certificaciones); se re-exportan para no romper los imports existentes.
export { IVA, netaAFinal, finalANeta } from '@/lib/utils/iva'

// Resuelve la tarifa $/ton de un tramo: si existe una tarifa específica para
// el depósito de descarga (empresa+cantera+depósito), gana sobre la general
// (empresa+cantera con deposito_id null). En ambos casos se toma la de
// `vigente_desde` más reciente que no supere la fecha de descarga.
export function tarifaParaFecha(
  tarifas: TarifaEmpresaCantera[],
  empresaId: number,
  canteraId: number | null,
  depositoId: number | null,
  fecha: string | null,
  // Unidad del viaje según el camión (chasis paga distinto en algunas
  // empresas). Escalera de prioridad: depósito+unidad > depósito > unidad
  // > general. Las tarifas sin tipo_unidad valen para cualquier unidad.
  tipoUnidad?: 'batea' | 'chasis',
  // Variante elegida en el tramo (tramos.tarifa_variante). Match EXACTO antes
  // de la escalera: tramo sin variante ↔ tarifas sin variante, tramo con
  // "Tarifa 2" ↔ tarifas variante="Tarifa 2". Sin fallback a la base a
  // propósito: variante inexistente para la ruta → $0 ("sin tarifa" visible),
  // no se factura con otra en silencio.
  variante?: string | null,
): number {
  if (!canteraId || !fecha) return 0
  const base = tarifas.filter(t =>
    t.empresa_id === empresaId && t.cantera_id === canteraId && t.vigente_desde <= fecha
    && ((t.variante ?? null) === (variante ?? null))
  )
  const pools = [
    depositoId != null && tipoUnidad ? base.filter(t => t.deposito_id === depositoId && t.tipo_unidad === tipoUnidad) : [],
    depositoId != null ? base.filter(t => t.deposito_id === depositoId && t.tipo_unidad == null) : [],
    tipoUnidad ? base.filter(t => t.deposito_id == null && t.tipo_unidad === tipoUnidad) : [],
    base.filter(t => t.deposito_id == null && t.tipo_unidad == null),
  ]
  const pool = pools.find(p => p.length > 0) ?? []
  const vigente = pool.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  return vigente?.valor_ton ?? 0
}

// Unidad del viaje según la categoría del camión: chasis → 'chasis';
// tractor (o camión desconocido) → 'batea'.
export function unidadDelCamion(camiones: Camion[], camionId: number | null | undefined): 'batea' | 'chasis' {
  if (camionId == null) return 'batea'
  return camiones.find(c => c.id === camionId)?.categoria === 'chasis' ? 'chasis' : 'batea'
}
