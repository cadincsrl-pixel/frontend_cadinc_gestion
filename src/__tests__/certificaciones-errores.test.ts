import { describe, it, expect } from 'vitest'
import { mensajeErrorCertificaciones, codigoErrorCertificaciones } from '@/modules/certificaciones/utils/certificaciones.errores'

/** Como lo tira `apiPatch`: el código en message y el body entero en `.body`. */
function httpError(code: string, detail?: unknown): Error {
  return Object.assign(new Error(code), { body: { error: code, detail } })
}

describe('errores de Pedidos y Stock en castellano', () => {
  it('los congelados dicen qué hacer, no el código', () => {
    expect(mensajeErrorCertificaciones(httpError('ITEM_CERTIFICADO'))).toMatch(/anular el certificado/)
    expect(mensajeErrorCertificaciones(httpError('NO_APRUEBA_SU_PROPIA_PROPUESTA'))).toMatch(/otra persona/)
    expect(codigoErrorCertificaciones(httpError('ITEM_COBRADO'))).toBe('ITEM_COBRADO')
  })

  it('un código desconocido no sale crudo solo: va con el fallback', () => {
    expect(mensajeErrorCertificaciones(httpError('ALGO_NUEVO'), 'No se pudo guardar')).toBe('No se pudo guardar (ALGO_NUEVO)')
  })

  it('un mensaje en castellano del backend pasa tal cual', () => {
    expect(mensajeErrorCertificaciones(new Error('Ítem no encontrado o no se puede editar'))).toBe('Ítem no encontrado o no se puede editar')
  })

  it('sin error legible, el fallback', () => {
    expect(mensajeErrorCertificaciones(null, 'Error')).toBe('Error')
  })
})
