/**
 * Entrar a un aviso / chip con número muestra lo que dice el número
 * (CLAUDE.md §5.9). Bug 2026-09-25: con «Vence en 30 días» puesto, «Sin
 * imputar (N)» abría una lista vacía (las importadas no tienen `vence_el`),
 * porque el chip mezclaba su filtro con el que había.
 */
import { describe, it, expect } from 'vitest'
import { FILTRO_POR_AVISO, FILTRO_INICIAL, filtroDeAviso } from '@/modules/pagos/utils/filtrosAviso'
import { queryFacturas } from '@/modules/pagos/hooks/usePagos'

describe('filtroDeAviso', () => {
  it.each(Object.keys(FILTRO_POR_AVISO))('«%s»: la lista pide lo mismo que cuenta el chip, venga de donde venga', (aviso) => {
    const f = filtroDeAviso(aviso)
    expect(queryFacturas(f)).toBe(queryFacturas(FILTRO_POR_AVISO[aviso]!))
    // Es el filtro entero del aviso: ninguna clave de más que achique la lista.
    const qs = new URLSearchParams(queryFacturas(f))
    for (const k of ['q', 'proveedor_id', 'concepto_id', 'clase', 'sin_adjunto', 'periodo_iva', 'importacion_id']) {
      expect(qs.has(k)).toBe(false)
    }
  })

  it('«Sin imputar» y «Pagos a reconstruir» no filtran por vencimiento', () => {
    expect(filtroDeAviso('sin-imputar').vencimiento).toBeUndefined()
    expect(filtroDeAviso('a-reconstruir').vencimiento).toBeUndefined()
    expect(filtroDeAviso('a-reconstruir').sin_imputar).toBeUndefined()
    expect(filtroDeAviso('a-reconstruir').estados).toBeUndefined()
  })

  it('?aviso=sin-imputar&importacion=N sigue limitando a esa importación', () => {
    expect(filtroDeAviso('sin-imputar', 13)).toEqual({ ...FILTRO_POR_AVISO['sin-imputar'], importacion_id: 13 })
    // En otro aviso la importación no aplica.
    expect(filtroDeAviso('aprobar', 13).importacion_id).toBeUndefined()
  })

  it('sin aviso o con uno desconocido: la bandeja inicial', () => {
    expect(filtroDeAviso(null)).toEqual(FILTRO_INICIAL)
    expect(filtroDeAviso('no-existe')).toEqual(FILTRO_INICIAL)
  })

  it('devuelve una copia: tocar el filtro no cambia la constante', () => {
    const f = filtroDeAviso('sin-imputar')
    f.q = 'x'
    expect(FILTRO_POR_AVISO['sin-imputar']!.q).toBeUndefined()
  })
})
