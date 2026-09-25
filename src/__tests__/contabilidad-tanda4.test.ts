import { describe, expect, it } from 'vitest'
import type { CtbAsiento, CtbBalanceRes, CtbDiarioItem, CtbEstadoFila, CtbResultadosRes } from '@/types/contabilidad.types'
import { fuentesDeCircuitos, leerCircuitosGuardados, nombrarCircuitos } from '@/modules/contabilidad/utils/contabilidad.utils'
import { filasDiario, numeroResumen } from '@/modules/contabilidad/utils/exportarDiario'
import { filasBalance, filasResultados, grupoDeFila } from '@/modules/contabilidad/utils/exportarEstados'

describe('circuitos', () => {
  it('con todos no filtra; si no, junta las fuentes', () => {
    expect(fuentesDeCircuitos(['ventas', 'cobros', 'compras', 'pagos', 'fondos'])).toBeUndefined()
    // Tanda 5: los cuatro viejos ya no son «todos» (falta Fondos).
    expect(fuentesDeCircuitos(['ventas', 'cobros', 'compras', 'pagos'])).toEqual([
      'ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros', 'pagos_facturas', 'pagos_ordenes',
    ])
    expect(fuentesDeCircuitos(['fondos'])).toEqual(['tesoreria_movimientos'])
    expect(fuentesDeCircuitos(['ventas'])).toEqual(['ventas_facturas', 'ventas_comprobantes_externos'])
    expect(fuentesDeCircuitos(['compras', 'pagos'])).toEqual(['pagos_facturas', 'pagos_ordenes'])
    expect(fuentesDeCircuitos([])).toEqual([])
  })
  it('lee lo guardado y vuelve a todos si está roto o vacío', () => {
    const todos = ['ventas', 'cobros', 'compras', 'pagos', 'fondos']
    expect(leerCircuitosGuardados(null)).toEqual(todos)
    expect(leerCircuitosGuardados('no json')).toEqual(todos)
    expect(leerCircuitosGuardados('[]')).toEqual(todos)
    expect(leerCircuitosGuardados('{"a":1}')).toEqual(todos)
    expect(leerCircuitosGuardados('["compras","x","ventas"]')).toEqual(['ventas', 'compras'])
  })
  it('nombra los circuitos', () => {
    expect(nombrarCircuitos(['compras', 'ventas'])).toBe('Ventas y Compras')
    expect(nombrarCircuitos(['ventas', 'cobros', 'pagos'])).toBe('Ventas, Cobros y Pagos')
  })
})

const linea = (codigo: string, debe: number, haber: number) => ({
  id: 1, orden: 1, cuenta_id: 1, cuenta_codigo: codigo, cuenta_nombre: `Cuenta ${codigo}`, debe, haber,
  aux_tipo: 'none' as const, aux_id: null, aux_nombre: null, obra_cod: null, obra_nom: null, glosa: '',
})

describe('filasDiario', () => {
  const asiento = {
    id: 7, numero: 3, fecha: '2026-07-02', glosa: 'Aporte', tipo: 'manual',
    lineas: [linea('1.1.1.01.01', 100, 0), linea('3.1.1.01', 0, 100)],
  } as unknown as CtbAsiento
  const items: CtbDiarioItem[] = [
    { ...asiento, clase: 'asiento', orden: 1 },
    {
      clase: 'resumen', orden: 2, clave: 'ventas:2026-07-01', circuito: 'ventas', periodo_desde: '2026-07-01', periodo_hasta: '2026-07-31',
      fecha: '2026-07-31', glosa: 'Ventas de julio 2026 (2 comprobantes)', cantidad_comprobantes: 2, cantidad_asientos: 2,
      cantidad_reversiones: 0, numero_desde: 4, numero_hasta: 9, sin_numero: 0, total: 1210, cuadra: true,
      lineas: [
        { cuenta_id: 1, cuenta_codigo: '1.1.3.01.01', cuenta_nombre: 'Deudores', debe: 1210, haber: 0 },
        { cuenta_id: 2, cuenta_codigo: '2.1.3.01.01', cuenta_nombre: 'IVA DF', debe: 0, haber: 210 },
        { cuenta_id: 3, cuenta_codigo: '4.1.1.01.01', cuenta_nombre: 'Ventas', debe: 0, haber: 1000 },
      ],
    },
  ]
  it('encabezado, líneas y subtotal por ítem, y totales al final', () => {
    const f = filasDiario(items, { total_debe: 1310, total_haber: 1310 })
    expect(f[0]).toEqual(['N°', 'Fecha', 'Cuenta', 'Nombre de la cuenta', 'Detalle', 'Debe', 'Haber'])
    expect(f[1]).toEqual([1, '02/07/2026', null, null, 'Aporte · N° 3', null, null])
    expect(f[2]?.[5]).toBe(100)
    expect(f[3]?.[6]).toBe(100)
    expect(f[4]).toEqual([null, null, null, null, 'Subtotal', 100, 100])
    expect(f[5]?.[4]).toBe('Ventas de julio 2026 (2 comprobantes) · N° 4 a 9')
    expect(f[9]).toEqual([null, null, null, null, 'Subtotal', 1210, 1210])
    expect(f.at(-2)).toEqual([null, null, null, null, 'TOTALES', 1310, 1310])
    expect(f.at(-1)?.[4]).toBe('Cuadra')
  })
  it('número del resumen', () => {
    expect(numeroResumen({ numero_desde: null, numero_hasta: null, sin_numero: 3, cantidad_asientos: 3 })).toBe('s/n')
    expect(numeroResumen({ numero_desde: 5, numero_hasta: 5, sin_numero: 0, cantidad_asientos: 1 })).toBe('5')
    expect(numeroResumen({ numero_desde: 5, numero_hasta: 8, sin_numero: 2, cantidad_asientos: 6 })).toBe('5 a 8 (+2 s/n)')
  })
})

const fila = (codigo: string | null, nombre: string, nivel: number, saldo: number, extra: Partial<CtbEstadoFila> = {}): CtbEstadoFila => ({
  cuenta_id: codigo ? 1 : null, codigo, nombre, nivel, rubro: 'activo', imputable: nivel >= 5, padre_id: null, virtual: false, saldo, ...extra,
})

describe('filasBalance', () => {
  const res: CtbBalanceRes = {
    fecha: '2026-09-30', ejercicio: { id: 1, nombre: '2026/27', desde: '2026-07-01', hasta: '2027-06-30' }, nivel: 2, sin_apertura: true,
    activo: {
      total: 150,
      grupos: [{ cuenta_id: 2, codigo: '1.1', nombre: 'ACTIVO CORRIENTE', total: 100 }, { cuenta_id: 3, codigo: '1.2', nombre: 'ACTIVO NO CORRIENTE', total: 50 }],
      filas: [fila('1', 'ACTIVO', 1, 150), fila('1.1', 'ACTIVO CORRIENTE', 2, 100), fila('1.2', 'ACTIVO NO CORRIENTE', 2, 50)],
    },
    pasivo: { total: 40, grupos: [{ cuenta_id: 5, codigo: '2.1', nombre: 'PASIVO CORRIENTE', total: 40 }], filas: [fila('2.1', 'PASIVO CORRIENTE', 2, 40, { rubro: 'pasivo' })] },
    pn: { total: 110, resultado_ejercicio: 10, filas: [fila('3.1', 'APORTE', 2, 100, { rubro: 'pn' }), fila(null, 'Resultado del ejercicio (no cerrado)', 2, 10, { rubro: 'pn', virtual: true })] },
    pasivo_mas_pn: 150, diferencia: 0, cuadra: true,
  }
  it('subtotal de cada grupo después de sus filas y totales de las raíces', () => {
    const f = filasBalance(res)
    const i11 = f.findIndex(r => r[0] === '   Total ACTIVO CORRIENTE')
    const i12 = f.findIndex(r => r[0] === '   Total ACTIVO NO CORRIENTE')
    expect(i11).toBeGreaterThan(f.findIndex(r => String(r[0]).includes('1.1 ACTIVO CORRIENTE')))
    expect(i12).toBeGreaterThan(i11)
    expect(f.find(r => r[0] === 'TOTAL ACTIVO')?.[1]).toBe(150)
    expect(f.find(r => r[0] === 'TOTAL PASIVO + PATRIMONIO NETO')?.[1]).toBe(150)
    expect(f.some(r => String(r[0]).includes('Resultado del ejercicio (no cerrado)'))).toBe(true)
    expect(f.some(r => r[0] === 'Cuadra')).toBe(true)
    expect(f.some(r => String(r[0]).includes('asiento de apertura'))).toBe(true)
  })
  it('grupo por prefijo de código', () => {
    const g = res.activo.grupos
    expect(grupoDeFila({ codigo: '1.1.3.01.01' }, g)?.codigo).toBe('1.1')
    expect(grupoDeFila({ codigo: '1.10' }, g)).toBeNull()
    expect(grupoDeFila({ codigo: null }, g)).toBeNull()
  })
})

describe('filasResultados', () => {
  const base: Omit<CtbResultadosRes, 'comparativo' | 'columnas'> = {
    desde: '2026-07-01', hasta: '2026-08-31', ejercicio: { id: 1, nombre: '2026/27', desde: '2026-07-01', hasta: '2027-06-30' }, nivel: 4,
    ingresos: { total: 300, totales_col: [100, 200], filas: [fila('4.1.1.01', 'VENTAS', 4, 300, { rubro: 'ingreso', importes: [100, 200] })] },
    gastos:   { total: 120, totales_col: [20, 100],  filas: [fila('4.2.1.01', 'COSTO', 4, 120, { rubro: 'egreso', importes: [20, 100] })] },
    resultado: { total: 180, totales_col: [80, 100] },
  }
  it('sin comparativo: cuenta y total', () => {
    const f = filasResultados({ ...base, comparativo: false, columnas: [] })
    expect(f[0]).toEqual(['Cuenta', 'Total'])
    expect(f.find(r => r[0] === 'TOTAL INGRESOS')).toEqual(['TOTAL INGRESOS', 300])
    expect(f.at(-1)).toEqual(['RESULTADO (GANANCIA)', 180])
  })
  it('comparativo: una columna por mes y el total', () => {
    const f = filasResultados({
      ...base, comparativo: true,
      columnas: [
        { clave: '2026-07', desde: '2026-07-01', hasta: '2026-07-31', etiqueta: 'jul 2026' },
        { clave: '2026-08', desde: '2026-08-01', hasta: '2026-08-31', etiqueta: 'ago 2026' },
      ],
    })
    expect(f[0]).toEqual(['Cuenta', 'jul 2026', 'ago 2026', 'Total'])
    expect(f.find(r => String(r[0]).includes('VENTAS'))?.slice(1)).toEqual([100, 200, 300])
    expect(f.find(r => r[0] === 'TOTAL GASTOS')).toEqual(['TOTAL GASTOS', 20, 100, 120])
    expect(f.at(-1)).toEqual(['RESULTADO (GANANCIA)', 80, 100, 180])
  })
})
