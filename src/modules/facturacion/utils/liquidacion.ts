/**
 * «Cargar liquidación» (20260930k): de la propuesta que devuelve el backend
 * (POST /cobros/liquidacion/leer) y lo que la persona corrigió en el modal, al
 * cuerpo del POST /cobros de siempre, y por qué no se puede confirmar todavía.
 * Puro, para testear.
 */
import type {
  VentasAmbiente, VentasCobroAdjuntoInput, VentasCobroInput, VentasLiquidacionPropuesta,
} from '@/types/domain.types'

export interface EdicionLiquidacion {
  fecha:     string
  obs:       string
  /** Concepto elegido por renglón de gasto (índice → id); null = sin elegir. */
  conceptos: Array<number | null>
  /** Librador por cheque (se puede corregir). */
  libradores: string[]
  /** La persona aceptó que una parte quede a cuenta. */
  aceptaACuenta: boolean
  /** La persona aceptó registrar aunque los controles no cierren. */
  aceptaDescuadre: boolean
}

const cent = (n: number) => Math.round(n * 100)

export function edicionInicial(p: VentasLiquidacionPropuesta, hoy: string): EdicionLiquidacion {
  return {
    fecha:      p.liquidacion.fecha && p.liquidacion.fecha <= hoy ? p.liquidacion.fecha : hoy,
    obs:        p.obs_sugerida,
    conceptos:  p.gastos.map(g => g.concepto_id),
    libradores: p.cheques.map(c => c.librador ?? ''),
    aceptaACuenta:   false,
    aceptaDescuadre: false,
  }
}

/** Lo que queda a cuenta: total del cobro − lo que se imputa. */
export function aCuentaLiquidacion(p: VentasLiquidacionPropuesta): number {
  return Math.max(0, cent(p.total_cobro) - cent(p.total_imputar)) / 100
}

/** Por qué todavía no se puede registrar (vacío = se puede). */
export function bloqueosLiquidacion(p: VentasLiquidacionPropuesta, e: EdicionLiquidacion, hoy: string): string[] {
  const out: string[] = []
  if (p.ya_cargada) out.push(`La liquidación N° ${p.liquidacion.numero} ya está cargada${p.ya_cargada.numero_fmt ? ` (${p.ya_cargada.numero_fmt})` : ''}.`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) out.push('Poné la fecha del cobro.')
  else if (e.fecha > hoy) out.push('La fecha no puede ser posterior a hoy.')
  const sinConcepto = e.conceptos.filter(c => c == null).length
  if (sinConcepto) out.push(`Elegí el concepto de ${sinConcepto === 1 ? 'un gasto' : `${sinConcepto} gastos`}.`)
  p.cheques.forEach((c, i) => {
    if (c.avisos.includes('YA_EN_OTRO_COBRO')) out.push(`El cheque N° ${c.numero} ya está en otro cobro vigente.`)
    if (!c.fecha_cobro) out.push(`Falta la fecha de cobro del cheque N° ${c.numero}.`)
    if (!(e.libradores[i] ?? '').trim()) out.push(`Falta el librador del cheque N° ${c.numero}.`)
  })
  if (cent(p.total_cobro) <= 0) out.push('La liquidación no trae importes.')
  if (!p.controles.ok && !e.aceptaDescuadre) out.push('Los importes de la liquidación no cierran: revisalos y confirmá que la registrás igual.')
  if (aCuentaLiquidacion(p) > 0 && !e.aceptaACuenta) out.push('Una parte queda a cuenta: confirmá que la registrás igual.')
  return out
}

/** El POST /cobros: UN cobro con los cheques, los gastos, las imputaciones y la liquidación adjunta. */
export function cuerpoCobroLiquidacion(
  p: VentasLiquidacionPropuesta,
  e: EdicionLiquidacion,
  opts: { ambiente?: VentasAmbiente; otrosAdjuntos?: VentasCobroAdjuntoInput[] } = {},
): VentasCobroInput {
  return {
    cobro: {
      fecha: e.fecha, cliente_id: p.cliente.id, obs: e.obs.trim(), liquidacion_numero: p.liquidacion.numero,
      ...(opts.ambiente ? { ambiente: opts.ambiente } : {}),
    },
    medios: p.cheques.map((c, i) => ({
      forma: 'cheque' as const,
      importe: c.importe,
      cheque_numero: c.numero,
      cheque_banco: c.banco,
      cheque_librador: (e.libradores[i] ?? '').trim(),
      cheque_librador_cuit: c.librador_cuit,
      cheque_fecha_cobro: c.fecha_cobro,
      obs: `${c.tipo} · liquidación N° ${p.liquidacion.numero}`,
    })),
    retenciones: [],
    gastos: p.gastos.map((g, i) => ({
      concepto_id: e.conceptos[i] as number,
      importe: g.importe,
      obs: [g.texto, g.comprobante ? `comp. ${g.comprobante}` : null].filter(Boolean).join(' · ').slice(0, 300),
    })),
    imputaciones: p.comprobantes
      .filter(c => c.destino && c.imputar > 0)
      .map(c => (c.destino!.tipo === 'externo'
        ? { externo_id: c.destino!.id, importe: c.imputar }
        : { factura_id: c.destino!.id, importe: c.imputar })),
    adjuntos: [
      { tipo: 'liquidacion', storage_path: p.adjunto.storage_path, nombre_archivo: p.adjunto.nombre_archivo, mime: p.adjunto.mime },
      ...(opts.otrosAdjuntos ?? []),
    ],
  }
}

/** «PAGO DE PLAYA - GONZALEZ JOSE» → sinónimo propuesto para un concepto nuevo (minúsculas, sin acentos ni signos; la persona lo recorta). */
export function sinonimoSugerido(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60).trim()
}
