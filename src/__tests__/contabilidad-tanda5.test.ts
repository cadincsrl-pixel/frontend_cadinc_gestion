import { describe, expect, it } from 'vitest'
import type { CtbCuadroBienes, CtbCuenta, CtbMapeosCatalogo, TesMovimiento } from '@/types/contabilidad.types'
import { circuitoLabel, fuentesDeCircuitos, leerCircuitosGuardados, finMesAnterior } from '@/modules/contabilidad/utils/contabilidad.utils'
import {
  armarBienes, CLAVE_ENVIO, columnaDe, fechaDeSerial, leerCsvBienes, parseFechaBien, parseImporteBien, parseVidaUtil,
} from '@/modules/contabilidad/utils/bienesImport'
import { equivalenteArs, numeroMovimiento, requisitosMoneda, conceptoCompatible, esDepositoDeValores } from '@/modules/contabilidad/utils/fondos'
import { filasMovimientos } from '@/modules/contabilidad/utils/exportarFondos'
import { filasCuadro, filasPorRubro } from '@/modules/contabilidad/utils/exportarBienes'
import { cuotaMensual, sugerirCuentaAmort, sugerirCuentaGasto, tituloDeCuenta } from '@/modules/contabilidad/utils/bienes'
import { mensajeCodigoCtb } from '@/modules/contabilidad/utils/contabilidad.errores'

// Contabilidad tanda 5 (20260928l–q): circuito Fondos, monedas de los
// movimientos, lector del inventario de bienes de uso y los Excel.

describe('circuito Fondos y la memoria de localStorage', () => {
  it('los cuatro circuitos guardados antes de Fondos se leen como «todos»', () => {
    const todos = ['ventas', 'cobros', 'compras', 'pagos', 'fondos']
    expect(leerCircuitosGuardados('["ventas","cobros","compras","pagos"]')).toEqual(todos)
    expect(leerCircuitosGuardados('["pagos","compras","cobros","ventas"]')).toEqual(todos)
    expect(fuentesDeCircuitos(leerCircuitosGuardados('["ventas","cobros","compras","pagos"]'))).toBeUndefined()
  })
  it('una elección parcial se respeta (no se le suma Fondos)', () => {
    expect(leerCircuitosGuardados('["ventas","compras"]')).toEqual(['ventas', 'compras'])
    expect(leerCircuitosGuardados('["fondos"]')).toEqual(['fondos'])
    expect(leerCircuitosGuardados('["ventas","cobros","compras"]')).toEqual(['ventas', 'cobros', 'compras'])
  })
  it('etiqueta', () => {
    expect(circuitoLabel('fondos')).toBe('Fondos')
  })
})

describe('movimientos de fondos: monedas', () => {
  it('pide cotización o importe de destino según las monedas', () => {
    expect(requisitosMoneda('egreso', 'ARS', null)).toEqual({ pideCotizacion: false, pideImporteDestino: false })
    expect(requisitosMoneda('egreso', 'USD', null)).toEqual({ pideCotizacion: true, pideImporteDestino: false })
    expect(requisitosMoneda('transferencia', 'ARS', 'ARS')).toEqual({ pideCotizacion: false, pideImporteDestino: false })
    expect(requisitosMoneda('transferencia', 'USD', 'USD')).toEqual({ pideCotizacion: true, pideImporteDestino: false })
    expect(requisitosMoneda('transferencia', 'ARS', 'USD')).toEqual({ pideCotizacion: false, pideImporteDestino: true })
    expect(requisitosMoneda('transferencia', 'USD', null)).toEqual({ pideCotizacion: false, pideImporteDestino: false })
  })
  it('equivalente en pesos, con el mismo redondeo que la base', () => {
    expect(equivalenteArs({ tipo: 'egreso', origen: 'ARS', destino: null, importe: 1234.5 })).toEqual({ ars: 1234.5, cotizacion: null })
    expect(equivalenteArs({ tipo: 'egreso', origen: 'USD', destino: null, importe: 100, cotizacion: 1234.567 })).toEqual({ ars: 123456.7, cotizacion: null })
    expect(equivalenteArs({ tipo: 'egreso', origen: 'USD', destino: null, importe: 100 }).ars).toBeNull()
    // ARS → USD: el lado en pesos manda y la cotización se deriva.
    expect(equivalenteArs({ tipo: 'transferencia', origen: 'ARS', destino: 'USD', importe: 130000, importeDestino: 100 }))
      .toEqual({ ars: 130000, cotizacion: 1300 })
    // USD → ARS.
    expect(equivalenteArs({ tipo: 'transferencia', origen: 'USD', destino: 'ARS', importe: 300, importeDestino: 400000 }))
      .toEqual({ ars: 400000, cotizacion: 1333.333333 })
    expect(equivalenteArs({ tipo: 'transferencia', origen: 'USD', destino: 'USD', importe: 10, cotizacion: 1000 }).ars).toBe(10000)
  })
  it('conceptos y número', () => {
    expect(conceptoCompatible({ sentido: 'ambos' }, 'ingreso')).toBe(true)
    expect(conceptoCompatible({ sentido: 'egreso' }, 'ingreso')).toBe(false)
    expect(conceptoCompatible({ sentido: 'egreso' }, 'transferencia')).toBe(false)
    expect(esDepositoDeValores('Depósito de valores')).toBe(true)
    expect(numeroMovimiento(123)).toBe('MF-000123')
  })
})

describe('bienes de uso: encabezados', () => {
  it('reconoce los alias de la spec', () => {
    expect(columnaDe('Descripción')?.columna).toBe('descripcion')
    expect(columnaDe('Rubro')?.columna).toBe('cuenta')
    expect(columnaDe('Fecha de alta')?.columna).toBe('fecha_alta')
    expect(columnaDe('V.O.')?.columna).toBe('valor_origen')
    expect(columnaDe('Vida útil (años)')).toEqual({ columna: 'vida_util', unidad: 'anios' })
    expect(columnaDe('Meses')).toEqual({ columna: 'vida_util', unidad: 'meses' })
    expect(columnaDe('%')).toEqual({ columna: 'vida_util', unidad: 'tasa' })
    expect(columnaDe('Amortización acumulada al 30/06/2026')?.columna).toBe('amort_acum_inicial')
    expect(columnaDe('Amort. Acum. Inicio')?.columna).toBe('amort_acum_inicial')
    expect(columnaDe('Cuenta amortización acumulada')?.columna).toBe('cuenta_amort')
    expect(columnaDe('Cuenta amortización')?.columna).toBe('cuenta_gasto')
    expect(columnaDe('N° serie')?.columna).toBe('identificador')
    expect(columnaDe('Valor residual contable')?.columna).toBe('control_neto')
    expect(columnaDe('Valor residual')?.columna).toBe('valor_residual')
    expect(columnaDe('Amortización del ejercicio')?.columna).toBe('control_amort_ejercicio')
    expect(columnaDe('Cualquier cosa')).toBeNull()
  })
})

describe('bienes de uso: valores', () => {
  it('fechas', () => {
    expect(parseFechaBien('15/03/2021')).toBe('2021-03-15')
    expect(parseFechaBien('2021-03-15')).toBe('2021-03-15')
    expect(parseFechaBien('03/2021')).toBe('2021-03-01')
    expect(parseFechaBien('1/2/99')).toBe('1999-02-01')
    expect(parseFechaBien('31/02/2021')).toBeNull()
    expect(parseFechaBien('ayer')).toBeNull()
    expect(parseFechaBien(44270)).toBe('2021-03-15')
    expect(fechaDeSerial(45838)).toBe('2025-06-30')
  })
  it('importes', () => {
    expect(parseImporteBien('$ 1.234.567,89')).toBe(1234567.89)
    expect(parseImporteBien('1234567.89')).toBe(1234567.89)
    expect(parseImporteBien('1.234.567')).toBe(1234567)
    expect(parseImporteBien('1.500')).toBe(1500)
    expect(parseImporteBien('12,5')).toBe(12.5)
    expect(parseImporteBien('1,234,567.50')).toBe(1234567.5)
    expect(parseImporteBien('(1.500,00)')).toBe(-1500)
    expect(parseImporteBien(98765.4)).toBe(98765.4)
    expect(parseImporteBien('abc')).toBeNull()
    expect(parseImporteBien(null)).toBeNull()
  })
  it('vida útil en años', () => {
    expect(parseVidaUtil(5)).toBe(5)
    expect(parseVidaUtil('10 años')).toBe(10)
    expect(parseVidaUtil(60, 'meses')).toBe(5)
    expect(parseVidaUtil('20%')).toBe(5)
    expect(parseVidaUtil(20, 'tasa')).toBe(5)
    expect(parseVidaUtil('0,10', 'tasa')).toBe(10)
    expect(parseVidaUtil(0)).toBeNull()
  })
})

describe('bienes de uso: armado de filas', () => {
  const matriz: unknown[][] = [
    ['CADINC S.R.L. — Inventario de bienes de uso al 30/06/2026'],
    [],
    ['Rubro', 'Descripción', 'Patente', 'Fecha de alta', 'V.O.', 'Vida útil (años)', 'Amort. acumulada', 'Neto', 'Columna rara'],
    ['RODADOS', null, null, null, null, null, null, null, null],
    ['Rodados', 'Camión Atego', 'AB123CD', '15/03/2021', '$ 10.000.000,00', 5, '6.000.000,00', '4.000.000,00', 'x'],
    ['Rodados', 'Camioneta Hilux', 'AC999ZZ', 44270, 5000000, '20%', 3000000, 1000, null],
    [null, 'TOTAL RODADOS', null, null, 15000000, null, 9000000, 6000000, null],
    ['Terrenos', 'Lote Ruta 9', null, '01/2019', '2.000.000', '-', 0, 2000000, null],
    ['Muebles', 'Escritorio', null, 'mañana', '150.000', 10, null, null, null],
  ]
  const r = armarBienes(matriz)

  it('encuentra el encabezado y saltea títulos, subtotales y vacías', () => {
    expect(r.error).toBeNull()
    expect(r.faltantes).toEqual([])
    expect(r.filas.map(f => f.filaArchivo)).toEqual([5, 6, 8, 9])
    expect(r.ignoradas).toBe(2)
    expect(r.columnas.find(c => c.encabezado === 'Columna rara')?.columna).toBeNull()
  })
  it('manda claves de la spec con los valores leídos', () => {
    const f = r.filas[0]!.datos
    expect(f[CLAVE_ENVIO.descripcion]).toBe('Camión Atego')
    expect(f[CLAVE_ENVIO.cuenta]).toBe('Rodados')
    expect(f[CLAVE_ENVIO.identificador]).toBe('AB123CD')
    expect(f[CLAVE_ENVIO.fecha_alta]).toBe('2021-03-15')
    expect(f[CLAVE_ENVIO.valor_origen]).toBe(10000000)
    expect(f[CLAVE_ENVIO.vida_util]).toBe(5)
    expect(f[CLAVE_ENVIO.amort_acum_inicial]).toBe(6000000)
    expect(f[CLAVE_ENVIO.control_neto]).toBe(4000000)
    expect(r.filas[0]!.problemas).toEqual([])
  })
  it('tasa, serial y neto que no cierra', () => {
    const f = r.filas[1]!
    expect(f.datos[CLAVE_ENVIO.fecha_alta]).toBe('2021-03-15')
    expect(f.datos[CLAVE_ENVIO.vida_util]).toBe(5)
    expect(f.problemas.some(p => p.includes('neto'))).toBe(true)
  })
  it('sin vida útil («-») viaja null y una fecha ilegible viaja tal cual con aviso', () => {
    expect(r.filas[2]!.datos[CLAVE_ENVIO.vida_util]).toBeNull()
    expect(r.filas[2]!.datos[CLAVE_ENVIO.fecha_alta]).toBe('2019-01-01')
    expect(r.filas[2]!.problemas).toEqual([])
    expect(r.filas[3]!.datos[CLAVE_ENVIO.fecha_alta]).toBe('mañana')
    expect(r.filas[3]!.problemas[0]).toMatch(/Fecha de alta ilegible/)
  })
  it('CSV con punto y coma', () => {
    const csv = 'Descripcion;Cuenta;Fecha alta;Valor origen;Meses\nTaladro;1.2.2.03.01;01/08/2026;120000;36\n;;;;\n'
    const c = leerCsvBienes(csv)
    expect(c.error).toBeNull()
    expect(c.filas).toHaveLength(1)
    expect(c.filas[0]!.datos[CLAVE_ENVIO.vida_util]).toBe(3)
    expect(c.filas[0]!.datos[CLAVE_ENVIO.cuenta]).toBe('1.2.2.03.01')
  })
  it('sin encabezado reconocible avisa', () => {
    expect(armarBienes([['a', 'b'], ['1', '2']]).error).toMatch(/encabezados/)
  })
  it('marca las columnas obligatorias que faltan', () => {
    const s = armarBienes([['Descripción', 'Valor de origen'], ['Silla', 1000]])
    expect(s.faltantes).toEqual(['cuenta', 'fecha_alta'])
  })
})

describe('bienes de uso: sugerencias y cuota', () => {
  const cta = (id: number, codigo: string, extra: Partial<CtbCuenta> = {}) => ({
    id, codigo, nombre: codigo, rubro: 'activo', imputable: true, activo: true, ...extra,
  }) as CtbCuenta
  const cuentas = [cta(1, '1.2.2.04.01'), cta(2, '1.2.2.04.03'), cta(3, '1.2.2.07.01'), cta(4, '1.2.2.05.03', { activo: false })]
  it('la hermana .03', () => {
    expect(tituloDeCuenta('1.2.2.04.01')).toBe('1.2.2.04')
    expect(sugerirCuentaAmort(cuentas, { codigo: '1.2.2.04.01' })?.id).toBe(2)
    expect(sugerirCuentaAmort(cuentas, { codigo: '1.2.2.07.01' })).toBeNull()
    expect(sugerirCuentaAmort(cuentas, { codigo: '1.2.2.05.01' })).toBeNull()
  })
  it('el gasto del mapeo: por título o general', () => {
    const cat = { claves: [{ clave: 'bienes.gasto', etiqueta: '', descripcion: '', rubros: ['egreso'], auxiliares: ['none'], subclaves: [
      { subclave: '', etiqueta: 'General', mapeo_id: 1, cuenta_id: 90, cuenta_codigo: null, cuenta_nombre: null, en_uso: 0 },
      { subclave: '1.2.2.04', etiqueta: 'Rodados', mapeo_id: 2, cuenta_id: 91, cuenta_codigo: null, cuenta_nombre: null, en_uso: 0 },
    ] }] } as CtbMapeosCatalogo
    expect(sugerirCuentaGasto(cat, { codigo: '1.2.2.04.01' })).toBe(91)
    expect(sugerirCuentaGasto(cat, { codigo: '1.2.2.03.01' })).toBe(90)
    expect(sugerirCuentaGasto(null, { codigo: '1.2.2.03.01' })).toBeNull()
  })
  it('cuota mensual', () => {
    expect(cuotaMensual(120000, 0, 5)).toBe(2000)
    expect(cuotaMensual(120000, 12000, 3)).toBe(3000)
    expect(cuotaMensual(120000, 0, null)).toBeNull()
  })
  it('fin del mes anterior', () => {
    expect(finMesAnterior('2026-09-24')).toBe('2026-08-31')
    expect(finMesAnterior('2026-03-01')).toBe('2026-02-28')
    expect(finMesAnterior('2027-01-15')).toBe('2026-12-31')
  })
})

describe('Excel', () => {
  it('movimientos: los anulados no suman', () => {
    const base = {
      tesoreria_id: 1, tesoreria_nombre: 'Galicia', tesoreria_tipo: 'banco', tesoreria_moneda: 'ARS', tesoreria_destino_id: null,
      destino_nombre: null, destino_moneda: null, concepto_id: 1, concepto_nombre: 'Comisiones', importe_destino: null, cotizacion: null,
      obra_cod: null, obra_nom: null, referencia: '', obs: '', origen: 'manual', extracto_linea_id: null, motivo_anulacion: null,
      anulado_por_nombre: null, anulado_at: null, cant_adjuntos: 0, asiento_id: null, asiento_numero: null, created_by_nombre: null, created_at: '',
    }
    const items = [
      { ...base, id: 1, numero: 1, fecha: '2026-09-01', tipo: 'egreso', importe: 100, importe_ars: 100, estado: 'vigente' },
      { ...base, id: 2, numero: 2, fecha: '2026-09-02', tipo: 'egreso', importe: 50, importe_ars: 50, estado: 'anulado', motivo_anulacion: 'duplicado' },
      { ...base, id: 3, numero: 3, fecha: '2026-09-03', tipo: 'ingreso', importe: 30, importe_ars: 30, estado: 'vigente', asiento_id: 9, asiento_numero: 12 },
    ] as TesMovimiento[]
    const f = filasMovimientos(items)
    expect(f[1]?.[0]).toBe('MF-000001')
    expect(f[2]?.[12]).toBe('Anulado: duplicado')
    expect(f[3]?.[13]).toBe('N° 12')
    expect(f.at(-3)?.[11]).toBe(30)
    expect(f.at(-2)?.[11]).toBe(100)
  })
  it('cuadro: bloque por rubro con subtotal y total general', () => {
    const fila = (id: number, rubro: string, vo: number, acum: number) => ({
      bien_id: id, codigo: `BU-000${id}`, descripcion: `Bien ${id}`, identificador: '', rubro_codigo: rubro, rubro_nombre: rubro === '1.2.2.04' ? 'Rodados' : 'Muebles',
      fecha_alta: '2021-01-01', fecha_baja: null, valor_origen: vo, valor_residual: 0, vida_util_anios: 5, amort_acum_inicio: acum,
      amort_ejercicio: 10, amort_acum_cierre: acum + 10, valor_neto: vo - acum - 10, falta_amortizar_teorico: 0, obra_cod: null,
    })
    const res = {
      ejercicio: { id: 1, nombre: '2026/27', desde: '2026-07-01', hasta: '2027-06-30' }, hasta: '2026-09-30',
      filas: [fila(1, '1.2.2.04', 1000, 100), fila(2, '1.2.2.04', 500, 50), fila(3, '1.2.2.05', 200, 0)],
      rubros: [
        { rubro_codigo: '1.2.2.04', rubro_nombre: 'Rodados', cantidad: 2, valor_origen: 1500, valor_residual: 0, amort_acum_inicio: 150, amort_ejercicio: 20, amort_acum_cierre: 170, valor_neto: 1330, falta_amortizar_teorico: 0 },
        { rubro_codigo: '1.2.2.05', rubro_nombre: 'Muebles', cantidad: 1, valor_origen: 200, valor_residual: 0, amort_acum_inicio: 0, amort_ejercicio: 10, amort_acum_cierre: 10, valor_neto: 190, falta_amortizar_teorico: 0 },
      ],
      control_mayor: [{ cuenta_id: 1, codigo: '1.2.2.04.01', nombre: 'Rodados VO', inventario: 1500, mayor: 1400, diferencia: 100 }],
    } as CtbCuadroBienes
    const c = filasCuadro(res)
    expect(c[1]?.[0]).toBe('1.2.2.04 Rodados')
    expect(c[4]?.[1]).toBe('Total Rodados')
    expect(c[4]?.[6]).toBe(1500)
    expect(c.at(-1)?.[1]).toBe('TOTAL GENERAL')
    expect(c.at(-1)?.[6]).toBe(1700)
    const r = filasPorRubro(res)
    expect(r[1]?.[2]).toBe(2)
    expect(r.at(-1)).toEqual(['1.2.2.04.01', 'Rodados VO', null, 1500, 1400, 100])
  })
})

describe('errores nuevos', () => {
  it('tienen texto', () => {
    expect(mensajeCodigoCtb('SIN_PERMISO_FONDOS')).toMatch(/Movimientos de fondos/)
    expect(mensajeCodigoCtb('IVA_DIFIERE_DE_LIBROS')).toMatch(/Libros IVA/)
    expect(mensajeCodigoCtb('BU_CUENTA_INVALIDA', { campo: 'cuenta_gasto_id' })).toMatch(/gasto/)
    expect(mensajeCodigoCtb('CONFIG_INVALIDA', { motivo: 'hay_amortizaciones' })).toMatch(/amortizaciones/)
  })
})
