/**
 * Cuándo vence una factura de proveedor.
 *
 * El caso que motivó esto (dueño, 2026-09-21): «Silva cierra el último día del
 * mes y vence a los 30 días del último día hábil». Con el modo viejo, dos
 * compras del mismo mes vencían en días distintos; en una cuenta corriente
 * tienen que caer juntas.
 */
import { describe, it, expect } from 'vitest'
import {
  componerNumero, fechaDeCierre, fmtM, partirNumero, ultimoDiaDelMes, ultimoDiaHabil,
  vencimientoSugerido,
} from '@/modules/pagos/utils/pagos.utils'

const SILVA = { vencimiento_modo: 'cierre_mensual' as const, cierre_dia: null, plazo_pago_dias: 30 }

describe('el caso Silva: todo el mes vence junto', () => {
  it('dos facturas del mismo mes vencen el MISMO día', () => {
    const temprano = vencimientoSugerido('2026-09-02', SILVA)
    const tarde    = vencimientoSugerido('2026-09-28', SILVA)
    expect(temprano).toBe(tarde)
  })

  it('septiembre 2026 cierra el 30 (miércoles) y vence 30 días después', () => {
    expect(ultimoDiaDelMes('2026-09-02')).toBe('2026-09-30')
    expect(ultimoDiaHabil('2026-09-30')).toBe('2026-09-30')
    expect(vencimientoSugerido('2026-09-02', SILVA)).toBe('2026-10-30')
  })

  it('una factura del último día del mes entra en ese cierre, no en el siguiente', () => {
    expect(vencimientoSugerido('2026-09-30', SILVA)).toBe('2026-10-30')
  })
})

describe('el cierre se corre al último día hábil', () => {
  it('si el último día del mes cae domingo, el cierre es el viernes', () => {
    // 31/05/2026 es domingo → cierre el viernes 29
    expect(ultimoDiaDelMes('2026-05-10')).toBe('2026-05-31')
    expect(ultimoDiaHabil('2026-05-31')).toBe('2026-05-29')
    expect(vencimientoSugerido('2026-05-10', SILVA)).toBe('2026-06-28')
  })

  it('si cae sábado, también retrocede al viernes', () => {
    // 31/01/2026 es sábado → viernes 30
    expect(ultimoDiaHabil('2026-01-31')).toBe('2026-01-30')
  })

  it('un día hábil no se mueve', () => {
    expect(ultimoDiaHabil('2026-09-21')).toBe('2026-09-21')   // lunes
    expect(ultimoDiaHabil('2026-09-25')).toBe('2026-09-25')   // viernes
  })
})

describe('cierre en un día fijo del mes', () => {
  const alDia25 = { vencimiento_modo: 'cierre_mensual' as const, cierre_dia: 25, plazo_pago_dias: 30 }

  it('lo comprado hasta el 25 entra en el cierre de ese mes', () => {
    expect(fechaDeCierre('2026-09-10', 25)).toBe('2026-09-25')
  })

  it('lo comprado después del 25 se pasa al cierre siguiente', () => {
    expect(fechaDeCierre('2026-09-28', 25)).toBe('2026-10-25')
  })

  it('el 25 justo entra en el de ese mes', () => {
    expect(fechaDeCierre('2026-09-25', 25)).toBe('2026-09-25')
  })

  it('un cierre el 31 en febrero cae el 28, no se desborda al 3 de marzo', () => {
    expect(fechaDeCierre('2026-02-10', 31)).toBe('2026-02-28')
  })

  it('cruza el año: una compra de diciembre cierra en enero', () => {
    expect(fechaDeCierre('2026-12-28', 25)).toBe('2027-01-25')
  })

  it('y el vencimiento sale de ese cierre', () => {
    // 25/09/2026 es viernes → hábil → +30
    expect(vencimientoSugerido('2026-09-10', alDia25)).toBe('2026-10-25')
  })
})

describe('el modo por días sigue igual que antes', () => {
  it('cada factura arrastra su propio vencimiento', () => {
    const porDias = { vencimiento_modo: 'dias' as const, cierre_dia: null, plazo_pago_dias: 30 }
    expect(vencimientoSugerido('2026-09-02', porDias)).toBe('2026-10-02')
    expect(vencimientoSugerido('2026-09-28', porDias)).toBe('2026-10-28')
  })

  it('sin modo cargado (los proveedores de hoy) se comporta como por días', () => {
    expect(vencimientoSugerido('2026-09-02', { plazo_pago_dias: 30 })).toBe('2026-10-02')
  })

  it('sin plazo cargado asume 30', () => {
    expect(vencimientoSugerido('2026-09-02', {})).toBe('2026-10-02')
  })

  it('plazo 0 es contado: vence el mismo día', () => {
    expect(vencimientoSugerido('2026-09-02', { plazo_pago_dias: 0 })).toBe('2026-09-02')
  })
})

describe('bordes', () => {
  it('sin fecha o sin proveedor no sugiere nada', () => {
    expect(vencimientoSugerido('', SILVA)).toBeNull()
    expect(vencimientoSugerido('2026-09-02', null)).toBeNull()
  })

  it('el vencimiento nunca cae antes de la factura', () => {
    for (const d of ['2026-01-05', '2026-02-28', '2026-05-31', '2026-12-31']) {
      expect(vencimientoSugerido(d, SILVA)! >= d).toBe(true)
    }
  })
})

describe('los centavos del reparto por obra', () => {
  // Caso real del 21/09: factura de $24.994,52 imputada a una sola obra.
  // La pantalla mostraba "A repartir $24.995", el usuario tipeaba 24995 y el
  // guardado quedaba bloqueado con el cartel "Sobran $0", que no se entiende.
  const r2 = (v: number) => Math.round(v * 100) / 100

  it('la plata SIEMPRE se muestra con centavos', () => {
    // Antes redondeaba a pesos: 24994,52 se leía "$24.995" y 0,48 se leía
    // "$0". De ahí salía el cartel "Sobran $0", imposible de entender.
    expect(fmtM(24994.52)).toBe('$24.994,52')
    expect(fmtM(0.48)).toBe('$0,48')
    expect(fmtM(1234567.8)).toBe('$1.234.567,80')
    expect(fmtM(0)).toBe('$0,00')
    expect(fmtM(null)).toBe('$0,00')
  })

  it('una diferencia de 48 centavos bloquea de verdad', () => {
    expect(Math.abs(r2(24994.52 - 24995)) < 0.005).toBe(false)
  })

  it('con el importe exacto, cuadra', () => {
    expect(Math.abs(r2(24994.52 - 24994.52)) < 0.005).toBe(true)
  })
})

describe('punto de venta y número, como en el papel (2026-09-21)', () => {
  it('compone con el formato de AFIP', () => {
    expect(componerNumero('13', '402141')).toBe('0013-00402141')
    expect(componerNumero('0013', '00402141')).toBe('0013-00402141')
  })

  it('ignora lo que no sea dígito', () => {
    expect(componerNumero('A-13', 'Nº 402.141')).toBe('0013-00402141')
  })

  it('un punto de venta de 5 dígitos no se recorta', () => {
    expect(componerNumero('08837', '4557')).toBe('08837-00004557')
  })

  it('vacío es vacío: no inventa 0000-00000000', () => {
    expect(componerNumero('', '')).toBe('')
  })

  it('parte una factura ya cargada para poder editarla', () => {
    expect(partirNumero('0013-00402141')).toEqual({ pv: '0013', nro: '00402141' })
  })

  it('parte también las viejas, tipeadas de corrido', () => {
    expect(partirNumero('0001100000194')).toEqual({ pv: '00011', nro: '00000194' })
    expect(partirNumero('0883700004557')).toEqual({ pv: '08837', nro: '00004557' })
  })

  it('sin número devuelve los dos campos vacíos', () => {
    expect(partirNumero(null)).toEqual({ pv: '', nro: '' })
    expect(partirNumero('')).toEqual({ pv: '', nro: '' })
  })

  it('componer y partir son inversas', () => {
    for (const [pv, nro] of [['0013','00402141'], ['0001','00000194'], ['08837','00004557']]) {
      expect(partirNumero(componerNumero(pv!, nro!))).toEqual({ pv, nro })
    }
  })
})
