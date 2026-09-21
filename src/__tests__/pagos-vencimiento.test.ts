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
  fechaDeCierre, ultimoDiaDelMes, ultimoDiaHabil, vencimientoSugerido,
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
