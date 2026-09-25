import { describe, it, expect } from 'vitest'
import {
  bloqueoPorFirma, chequeVacio, chequesParaEnviar, estadoCheques, filasIniciales, filasQueSePasan, formaSegunLoPrevisto,
  lineasDeOrden, problemaCheques, repartirTotalEnFilas, totalDeFilas,
} from '@/modules/pagos/utils/pagoForm'
import { comprobanteObligatorio } from '@/modules/pagos/utils/pagos.utils'
import { mensajeErrorPagos } from '@/modules/pagos/utils/pagos.errores'
import type { PagosFactura } from '@/types/domain.types'

// «Pagar en lote» (20260929t) y «Registrar pago» comparten estas reglas: si
// cambian acá, cambian en los dos modales. Son las mismas que valida el
// backend (`validarCheques`) y la RPC (`_pagos_emitir_orden`).

const HOY = '2026-09-25'
const fac = (p: Partial<PagosFactura>) => ({
  id: 1, proveedor_id: 1, tipo_comprobante: 'A', numero: '0001-00000001', saldo: 1000, saldo_pagable: 1000,
  vence_el: '2026-09-30', forma_pago_prevista: 'transferencia', created_by: 'otro', aprobada_por: 'diego', ...p,
} as PagosFactura)

const cheque = (p: Partial<ReturnType<typeof chequeVacio>>) => ({ ...chequeVacio(HOY, '0'), numero: '1', ...p })

describe('forma por defecto en el lote', () => {
  it('sin prevista común, la forma común de arriba', () => {
    expect(formaSegunLoPrevisto([fac({ forma_pago_prevista: 'cheque' }), fac({ forma_pago_prevista: 'efectivo' })], 'echeq')).toBe('echeq')
  })
  it('con prevista común, la prevista', () => {
    expect(formaSegunLoPrevisto([fac({ forma_pago_prevista: 'cheque' })], 'efectivo')).toBe('cheque')
  })
  it('sin segundo argumento sigue siendo transferencia (el modal suelto no cambia)', () => {
    expect(formaSegunLoPrevisto([])).toBe('transferencia')
  })
})

describe('facturas del pago', () => {
  it('arranca con el saldo pagable; parcial vale, pasarse no', () => {
    const filas = filasIniciales([fac({ id: 1, saldo: 1000, saldo_pagable: 800 }), fac({ id: 2, saldo: 500, saldo_pagable: 500 })])
    expect(filas.map(f => f.monto)).toEqual(['800', '500'])
    expect(filasQueSePasan(filas)).toHaveLength(0)
    const pasada = [{ ...filas[0]!, monto: '900' }, filas[1]!]
    expect(filasQueSePasan(pasada).map(f => f.factura.id)).toEqual([1])
    expect(totalDeFilas([{ ...filas[0]!, monto: '300' }, filas[1]!], '50')).toBe(850)
  })

  it('las líneas: sólo facturas con plata, y el a cuenta aparte', () => {
    const filas = filasIniciales([fac({ id: 1 }), fac({ id: 2 })])
    expect(lineasDeOrden([{ ...filas[0]!, monto: '0' }, filas[1]!], '10')).toEqual([
      { tipo: 'factura', factura_id: 2, monto: 1000 },
      { tipo: 'a_cuenta', factura_id: null, monto: 10 },
    ])
  })

  it('los cheques mandan: se reparte lo más viejo primero y lo que sobra va a cuenta', () => {
    const filas = filasIniciales([fac({ id: 1, vence_el: '2026-10-10', saldo_pagable: 600 }), fac({ id: 2, vence_el: '2026-09-01', saldo_pagable: 300 })])
    const r = repartirTotalEnFilas(1000, filas)
    expect(r.filas.map(f => [f.factura.id, f.monto])).toEqual([[1, '600'], [2, '300']])
    expect(r.aCuenta).toBe('100')
  })
})

describe('cheques', () => {
  it('Σ cheques tiene que dar exacto', () => {
    expect(problemaCheques([cheque({ monto: '400' })], 500, HOY)).toBe('Los cheques no suman lo que sale de plata')
    expect(problemaCheques([cheque({ monto: '500' })], 500, HOY)).toBeNull()
    expect(estadoCheques([cheque({ monto: '250.5' }), cheque({ monto: '249,5' })], 500, HOY).difCheques).toBe(0)
  })
  it('ninguno se cobra antes del pago', () => {
    expect(problemaCheques([cheque({ monto: '500', fecha_cobro: '2026-09-24' })], 500, HOY)).toMatch(/antes de la fecha del pago/)
  })
  it('un cheque de tercero pide librador', () => {
    expect(problemaCheques([cheque({ monto: '500', es_propio: false })], 500, HOY)).toMatch(/librador/)
    expect(problemaCheques([cheque({ monto: '500', es_propio: false, librador: 'Juan' })], 500, HOY)).toBeNull()
  })
  it('sin cheques o sin número no se registra', () => {
    expect(problemaCheques([], 500, HOY)).toBe('Cargá al menos un cheque')
    expect(problemaCheques([cheque({ monto: '500', numero: ' ' })], 500, HOY)).toMatch(/número/)
  })
  it('mientras se lee una foto, no', () => {
    expect(problemaCheques([cheque({ monto: '500', leyendo: true })], 500, HOY)).toMatch(/foto/)
  })
  it('lo que viaja: sin librador si es propio, con la foto como foto_path', () => {
    const c = cheque({ monto: '500', librador: 'x', foto: { tipo: 'cheque', storage_path: 'ordenes/pendientes/a.jpg', nombre_archivo: 'a.jpg', mime_type: 'image/jpeg' } })
    expect(chequesParaEnviar([c])[0]).toMatchObject({ numero: '1', monto: 500, es_propio: true, librador: '', foto_path: 'ordenes/pendientes/a.jpg' })
  })
})

describe('doble firma en el lote', () => {
  it('no pagás lo que cargaste ni lo que aprobaste; el admin sí', () => {
    expect(bloqueoPorFirma([fac({ created_by: 'yo' })], 'yo', false)).toMatch(/Cargaste vos/)
    expect(bloqueoPorFirma([fac({ aprobada_por: 'yo' })], 'yo', false)).toMatch(/Aprobaste vos/)
    expect(bloqueoPorFirma([fac({ created_by: 'yo' })], 'yo', true)).toBeNull()
    expect(bloqueoPorFirma([fac({})], 'yo', false)).toBeNull()
  })
})

describe('comprobante aparte (20260929u): en un e-cheq, el archivo de cada echeq ES el comprobante', () => {
  const conArchivo = { foto: { storage_path: 'ordenes/pendientes/a.pdf' } }
  const sinArchivo = { foto: null }
  it('e-cheq: todos con archivo → no hace falta; a uno le falta → sí; sin cheques → sí', () => {
    expect(comprobanteObligatorio('echeq', [conArchivo, conArchivo])).toBe(false)
    expect(comprobanteObligatorio('echeq', [conArchivo, sinArchivo])).toBe(true)
    expect(comprobanteObligatorio('echeq', [])).toBe(true)
  })
  it('transferencia sigue pidiéndolo; cheque físico y efectivo no', () => {
    expect(comprobanteObligatorio('transferencia', [conArchivo])).toBe(true)
    expect(comprobanteObligatorio('cheque', [sinArchivo])).toBe(false)
    expect(comprobanteObligatorio('efectivo')).toBe(false)
  })
  it('el mensaje del backend dice qué echeq no tiene archivo', () => {
    const e = Object.assign(new Error('COMPROBANTE_REQUERIDO'), { body: { error: 'COMPROBANTE_REQUERIDO', detail: { forma_pago: 'echeq', cheques_sin_archivo: ['3080'] } } })
    expect(mensajeErrorPagos(e)).toMatch(/N° 3080/)
    const t = Object.assign(new Error('COMPROBANTE_REQUERIDO'), { body: { error: 'COMPROBANTE_REQUERIDO', detail: { forma_pago: 'transferencia' } } })
    expect(mensajeErrorPagos(t)).toBe('Una transferencia necesita el comprobante de pago adjunto.')
  })
})
