import { describe, it, expect } from 'vitest'
import {
  bloqueoPorFirma, bloquesDelError, chequeVacio, chequesParaEnviar, estadoCheques, filasIniciales, filasQueSePasan, formaSegunLoPrevisto,
  chequesSinComprobante, lineasDeOrden, motivoChequesSinComprobante, problemaCheques, repartirTotalEnFilas, totalDeFilas,
} from '@/modules/pagos/utils/pagoForm'
import { comprobanteObligatorio, comprobantePorCheque, comprobantesDelPago } from '@/modules/pagos/utils/pagos.utils'
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
    expect(problemaCheques([cheque({ monto: '400' })], 500, HOY, 'cheque')).toBe('Los cheques no suman lo que sale de plata')
    expect(problemaCheques([cheque({ monto: '500' })], 500, HOY, 'cheque')).toBeNull()
    expect(estadoCheques([cheque({ monto: '250.5' }), cheque({ monto: '249,5' })], 500, HOY).difCheques).toBe(0)
  })
  it('ninguno se cobra antes del pago', () => {
    expect(problemaCheques([cheque({ monto: '500', fecha_cobro: '2026-09-24' })], 500, HOY, 'cheque')).toMatch(/antes de la fecha del pago/)
  })
  it('un cheque de tercero pide librador', () => {
    expect(problemaCheques([cheque({ monto: '500', es_propio: false })], 500, HOY, 'cheque')).toMatch(/librador/)
    expect(problemaCheques([cheque({ monto: '500', es_propio: false, librador: 'Juan' })], 500, HOY, 'cheque')).toBeNull()
  })
  it('sin cheques o sin número no se registra', () => {
    expect(problemaCheques([], 500, HOY, 'cheque')).toBe('Cargá al menos un cheque')
    expect(problemaCheques([cheque({ monto: '500', numero: ' ' })], 500, HOY, 'cheque')).toMatch(/número/)
  })
  it('mientras se lee el comprobante, no', () => {
    expect(problemaCheques([cheque({ monto: '500', leyendo: true })], 500, HOY, 'cheque')).toMatch(/termine de leer/)
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

describe('comprobante con cheques (20260929w): el de CADA cheque es el comprobante del pago, no hay uno aparte', () => {
  const archivo = { tipo: 'cheque' as const, storage_path: 'ordenes/pendientes/a.pdf', nombre_archivo: 'a.pdf', mime_type: 'application/pdf' }
  it('el comprobante aparte sólo existe (y es obligatorio) en transferencia', () => {
    expect(comprobanteObligatorio('transferencia')).toBe(true)
    expect(comprobanteObligatorio('echeq')).toBe(false)
    expect(comprobanteObligatorio('cheque')).toBe(false)
    expect(comprobanteObligatorio('efectivo')).toBe(false)
    expect(comprobantePorCheque('echeq')).toBe(true)
    expect(comprobantePorCheque('cheque')).toBe(true)
    expect(comprobantePorCheque('transferencia')).toBe(false)
  })
  it('e-cheq: cada fila necesita su comprobante y el aviso nombra el que falta', () => {
    const cs = [cheque({ numero: '123', monto: '300', foto: archivo }), cheque({ numero: '124', monto: '200' })]
    expect(chequesSinComprobante('echeq', cs).map(x => x.cheque.numero)).toEqual(['124'])
    expect(problemaCheques(cs, 500, HOY, 'echeq')).toBe('Falta el comprobante del e-cheq N° 124')
    const dos = [cheque({ numero: '123', monto: '300' }), cheque({ numero: ' ', monto: '200' })]
    expect(motivoChequesSinComprobante('echeq', chequesSinComprobante('echeq', dos))).toBe('Falta el comprobante de los e-cheqs N° 123, fila 2')
    expect(problemaCheques([cheque({ numero: '123', monto: '500', foto: archivo })], 500, HOY, 'echeq')).toBeNull()
  })
  it('mientras se sube el comprobante de una fila no se lo marca como faltante', () => {
    expect(chequesSinComprobante('echeq', [cheque({ monto: '500', leyendo: true })])).toEqual([])
  })
  it('cheque físico: el comprobante por fila es opcional', () => {
    expect(chequesSinComprobante('cheque', [cheque({ monto: '500' })])).toEqual([])
    expect(problemaCheques([cheque({ monto: '500' })], 500, HOY, 'cheque')).toBeNull()
  })
  it('lo que prueba un pago ya registrado: con cheques, el archivo de cada cheque (caso OP-0250)', () => {
    const adj = [
      { tipo: 'cheque', nombre_archivo: 'cheque-3079.pdf' },
      { tipo: 'recibo_proveedor', nombre_archivo: 'r.pdf' },
      { tipo: 'comprobante_pago', nombre_archivo: 'viejo.pdf', borrado: true },
    ]
    expect(comprobantesDelPago('echeq', adj).map(a => a.nombre_archivo)).toEqual(['cheque-3079.pdf'])
    expect(comprobantesDelPago('transferencia', adj)).toEqual([])
  })
  it('el backend: ECHEQ_SIN_ARCHIVO nombra el e-cheq; COMPROBANTE_REQUERIDO es de la transferencia', () => {
    const e = Object.assign(new Error('ECHEQ_SIN_ARCHIVO'), { body: { error: 'ECHEQ_SIN_ARCHIVO', detail: { forma_pago: 'echeq', cheques_sin_archivo: ['3080'] } } })
    expect(mensajeErrorPagos(e)).toMatch(/Falta el comprobante del e-cheq N° 3080/)
    const t = Object.assign(new Error('COMPROBANTE_REQUERIDO'), { body: { error: 'COMPROBANTE_REQUERIDO', detail: { forma_pago: 'transferencia' } } })
    expect(mensajeErrorPagos(t)).toBe('Una transferencia necesita el comprobante de pago adjunto.')
  })
})

// 25/09 (OP-0247/0248): el PDF del e-cheq de Cencosud se eligió también en el
// bloque de Gimenez. El backend lo frena con ARCHIVO_EN_VARIOS_BLOQUES y el
// modal pinta los dos bloques.
describe('el mismo archivo en dos bloques', () => {
  it('el error pinta todos los bloques que nombra', () => {
    expect(bloquesDelError({ indices: [0, 1], indice: 1 })).toEqual([0, 1])
    expect(bloquesDelError({ indice: 2 })).toEqual([2])
    expect(bloquesDelError({ campo: 'ordenes.3.cheques' })).toEqual([3])
    expect(bloquesDelError(null)).toEqual([])
  })
  it('el mensaje nombra el archivo', () => {
    const e = Object.assign(new Error('ARCHIVO_EN_VARIOS_BLOQUES'), { body: { error: 'ARCHIVO_EN_VARIOS_BLOQUES', detail: {
      indices: [0, 1], proveedor_ids: [1, 2], nombre_archivo: 'Cheque3076_CENCOSUD SA_30590360763.pdf', indice: 1,
    } } })
    expect(mensajeErrorPagos(e)).toMatch(/«Cheque3076_CENCOSUD SA_30590360763\.pdf» está en más de un proveedor/)
  })
})
