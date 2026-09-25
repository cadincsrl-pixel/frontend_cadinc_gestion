import type { PagosFacturasFiltro } from '../hooks/usePagos'

/**
 * Los filtros con los que entra la bandeja cuando se llega desde la campana
 * o desde un chip con número («Sin imputar (N)», «Pagos a reconstruir (N)»).
 * Cada uno replica EXACTAMENTE la query de su aviso en `useNotificaciones` y
 * la de su contador (`useContarFacturas`): si no coincidieran, el aviso diría
 * "3" y la pantalla mostraría otra cosa (CLAUDE.md §5.9).
 *
 * Por eso se ENTRA con `filtroDeAviso` (reemplaza el filtro entero) y no
 * mezclando con el filtro que había: un «Vence en 30 días», una búsqueda o un
 * proveedor que quedaran puestos achicaban la lista y el chip seguía
 * contando todo (bug 2026-09-25: «Sin imputar (N)» abría una lista vacía
 * porque las importadas no tienen `vence_el`).
 */
export const FILTRO_POR_AVISO: Record<string, PagosFacturasFiltro> = {
  // Sin las importadas sin imputar (20260927b): no se pueden aprobar hasta
  // imputarlas, y con mil importadas el aviso diría «1000 para aprobar».
  // Ninguno de los cuatro avisos cuenta las compras de meses ya pagados
  // (20260928, `pago_a_reconstruir`): no son deuda ni se aprueban.
  aprobar:      { estados: ['pendiente'], paga_cliente: false, sin_imputar: false, pago_a_reconstruir: false, orden: 'vencimiento' },
  vencidas:     { vencimiento: 'vencidas', paga_cliente: false, pago_a_reconstruir: false, orden: 'vencimiento' },
  'sin-revisar':{ sin_revisar: true, pago_a_reconstruir: false, orden: 'vencimiento' },
  observadas:   { estados: ['observada'], pago_a_reconstruir: false, orden: 'vencimiento' },
  // Importadas de ARCA que faltan imputar (20260927b). Lo usan el chip
  // «Sin imputar (N)», el link del importador y `?aviso=sin-imputar`.
  // Incluye las de meses ya pagados: también se imputan (contabilidad).
  'sin-imputar':{ sin_imputar: true, estados: ['pendiente', 'observada'], orden: 'fecha' },
  // Compras de meses ya pagados (20260928): el chip «Pagos a reconstruir (N)».
  'a-reconstruir':{ pago_a_reconstruir: true, orden: 'fecha' },
}

/**
 * «Abiertas, por vencimiento», SIN las importadas sin imputar: la bandeja «a
 * pagar» no se llena con mil comprobantes de ARCA. Esas se ven con el chip
 * «Sin imputar» o con el filtro.
 */
export const FILTRO_INICIAL: PagosFacturasFiltro = {
  estados: ['pendiente', 'observada', 'aprobada', 'pagada_parcial'],
  sin_imputar: false,
  // Las de meses ya pagados (20260928) no son deuda: chip «Pagos a reconstruir».
  pago_a_reconstruir: false,
  orden:   'vencimiento',
}

/**
 * El filtro COMPLETO de un aviso (nada del filtro anterior sobrevive). Con
 * `aviso=sin-imputar` e `importacion` (link del importador o
 * `?aviso=sin-imputar&importacion=N`) se limita a esa importación. Sin aviso
 * conocido, la bandeja inicial.
 */
export function filtroDeAviso(aviso: string | null | undefined, importacion?: number | null): PagosFacturasFiltro {
  const base = (aviso ? FILTRO_POR_AVISO[aviso] : undefined) ?? FILTRO_INICIAL
  return aviso === 'sin-imputar' && importacion ? { ...base, importacion_id: importacion } : { ...base }
}
