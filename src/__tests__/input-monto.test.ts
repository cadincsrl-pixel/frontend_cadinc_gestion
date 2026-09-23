import { describe, it, expect } from 'vitest'
import { aRaw, aDisplay, reformatear, interpretarCambio } from '@/components/ui/InputMonto'

// El contrato del InputMonto: lo tipeado/pegado (es-AR) se convierte a
// formato máquina ("1234567.89") y el display siempre muestra miles con
// punto y decimales con coma. Number(raw) debe funcionar SIEMPRE.

describe('aRaw (display/tipeo → formato máquina)', () => {
  it('dígitos pelados', () => {
    expect(aRaw('1234567', 2)).toBe('1234567')
  })
  it('descarta puntos de miles', () => {
    expect(aRaw('1.234.567', 2)).toBe('1234567')
  })
  it('coma como separador decimal', () => {
    expect(aRaw('1.234,56', 2)).toBe('1234.56')
  })
  it('recorta decimales de más', () => {
    expect(aRaw('10,999', 2)).toBe('10.99')
  })
  it('coma colgante = sin decimal', () => {
    expect(aRaw('1.234,', 2)).toBe('1234')
  })
  it('decimales=0 descarta la parte decimal (no la pega como dígitos)', () => {
    expect(aRaw('1.234,56', 0)).toBe('1234')
  })
  it('pegado es-AR completo', () => {
    expect(aRaw('1.234.567,89', 2)).toBe('1234567.89')
  })
  it('solo decimal arranca en 0', () => {
    expect(aRaw(',5', 2)).toBe('0.5')
  })
  it('vacío y basura', () => {
    expect(aRaw('', 2)).toBe('')
    expect(aRaw('abc', 2)).toBe('')
  })
  it('Number(raw) siempre es finito o NaN de vacío', () => {
    for (const t of ['1.234.567,89', '500', '0,5', '1.000']) {
      expect(Number.isFinite(Number(aRaw(t, 2)))).toBe(true)
    }
  })
})

describe('aDisplay (formato máquina → es-AR)', () => {
  it('miles con punto', () => {
    expect(aDisplay('1234567')).toBe('1.234.567')
  })
  it('decimales con coma', () => {
    expect(aDisplay('1234567.8')).toBe('1.234.567,8')
    expect(aDisplay(1234567.89)).toBe('1.234.567,89')
  })
  it('números chicos sin separador', () => {
    expect(aDisplay('999')).toBe('999')
    expect(aDisplay(0)).toBe('0')
  })
  it('vacío/null/undefined → vacío', () => {
    expect(aDisplay('')).toBe('')
    expect(aDisplay(null)).toBe('')
    expect(aDisplay(undefined)).toBe('')
  })
})

describe('reformatear (lo tipeado → display, conservando coma colgante)', () => {
  it('agrega miles mientras se tipea', () => {
    expect(reformatear('1234', 2)).toBe('1.234')
    expect(reformatear('1234567', 2)).toBe('1.234.567')
  })
  it('conserva la coma recién tipeada', () => {
    expect(reformatear('1234,', 2)).toBe('1.234,')
  })
  it('no conserva coma si decimales=0', () => {
    expect(reformatear('1234,', 0)).toBe('1.234')
  })
  it('round-trip estable: reformatear(display) === display', () => {
    for (const raw of ['1234567', '1234567.89', '500', '0.5']) {
      const disp = aDisplay(raw)
      expect(reformatear(disp, 2)).toBe(disp)
      expect(aRaw(disp, 2)).toBe(raw)
    }
  })
})

describe('el punto del teclado numérico también separa decimales (2026-09-21)', () => {
  // Pedido del dueño: «en el teclado numérico tenemos el punto, que se ponga
  // punto o coma indistintamente». Y la incoherencia que lo destapó: comprar
  // exigía coma, cargar el precio de un enviado exigía punto.

  it('punto y coma dan el MISMO número', () => {
    expect(aRaw('24994.52', 2)).toBe(aRaw('24994,52', 2))
    expect(aRaw('24994.52', 2)).toBe('24994.52')
  })

  it('el caso de la factura que trabó a Nicolás', () => {
    expect(Number(aRaw('24994.52', 2))).toBe(24994.52)
  })

  it('un decimal solo, y el cero adelante', () => {
    expect(aRaw('1.5', 2)).toBe('1.5')
    expect(aRaw('0.75', 2)).toBe('0.75')
    expect(aRaw('.5', 2)).toBe('0.5')
  })

  it('tres dígitos detrás de un punto siguen siendo MILES (es-AR)', () => {
    expect(aRaw('1.234', 2)).toBe('1234')
    expect(aRaw('24.994', 2)).toBe('24994')
  })

  it('dos o más puntos son siempre miles', () => {
    expect(aRaw('1.234.567', 2)).toBe('1234567')
    expect(aRaw('1.234.567,89', 2)).toBe('1234567.89')
  })

  it('si hay coma, la coma manda y los puntos son miles', () => {
    expect(aRaw('1.234,56', 2)).toBe('1234.56')
  })

  it('más de dos decimales se recortan SOLO si el separador es la coma', () => {
    expect(aRaw('10,9999', 2)).toBe('10.99')
  })

  // Esta expectativa estaba al revés y era el bug: decía que 4 dígitos detrás
  // del punto eran «decimal recortado» (10.9999 → 10,99). Detrás de un punto
  // decimal no pueden entrar más dígitos que los decimales permitidos, así que
  // 4 dígitos significan que ese punto es de MILES. Leerlo como decimal es lo
  // que hacía que tipear 25000 diera $2,50.
  it('más dígitos detrás del punto que decimales permitidos ⇒ el punto es de miles', () => {
    expect(aRaw('10.999', 2)).toBe('10999')
    expect(aRaw('10.9999', 2)).toBe('109999')
    expect(aRaw('2.5000', 2)).toBe('25000')
  })

  it('con decimales = 0 el punto sigue siendo miles', () => {
    expect(aRaw('1.234', 0)).toBe('1234')
    expect(aRaw('24994.52', 0)).toBe('2499452')
  })
})

describe('mientras se tipea, el monto se va acomodando solo', () => {
  it('el punto se ve como coma apenas se escribe', () => {
    expect(reformatear('24994.', 2)).toBe('24.994,')
    expect(reformatear('24994.5', 2)).toBe('24.994,5')
    expect(reformatear('24994.52', 2)).toBe('24.994,52')
  })

  it('los miles aparecen solos mientras se tipea', () => {
    expect(reformatear('1', 2)).toBe('1')
    expect(reformatear('1234', 2)).toBe('1.234')
    expect(reformatear('1234567', 2)).toBe('1.234.567')
  })

  it('tipear el número entero paso a paso nunca cambia lo que ya se puso', () => {
    const pasos = ['2', '24', '249', '2499', '24994', '24994.', '24994.5', '24994.52']
    const vistos = pasos.map(p => reformatear(p, 2))
    expect(vistos).toEqual(['2', '24', '249', '2.499', '24.994', '24.994,', '24.994,5', '24.994,52'])
  })
})

describe('tipear el decimal cuando el campo YA muestra los miles (2026-09-21)', () => {
  // El caso que reportó el dueño: el total mostraba "24.995" con su punto de
  // miles, tipeó ".52" al final y quedó "24.995.52". La regla vieja leía dos
  // separadores de miles: $2.499.552, cien veces de más. Con coma andaba.
  it('el último punto es el decimal, los anteriores son miles', () => {
    expect(aRaw('24.995.52', 2)).toBe('24995.52')
    expect(aRaw('1.234.567.89', 2)).toBe('1234567.89')
  })

  it('y da lo mismo que tipearlo con coma', () => {
    expect(aRaw('24.995.52', 2)).toBe(aRaw('24.995,52', 2))
  })

  it('tres dígitos detrás del último punto SIGUEN siendo miles', () => {
    expect(aRaw('1.234.567', 2)).toBe('1234567')
    expect(aRaw('24.995', 2)).toBe('24995')
  })

  it('el display lo acomoda mientras se teclea', () => {
    expect(reformatear('24.995.', 2)).toBe('24.995,')
    expect(reformatear('24.995.5', 2)).toBe('24.995,5')
    expect(reformatear('24.995.52', 2)).toBe('24.995,52')
  })

  it('corregir un total ya cargado, tecla por tecla', () => {
    // Parte de "24.995" en pantalla y agrega los centavos con el teclado numérico.
    const pasos = ['24.995', '24.995.', '24.995.5', '24.995.52']
    expect(pasos.map(p => reformatear(p, 2))).toEqual(['24.995', '24.995,', '24.995,5', '24.995,52'])
    expect(aRaw('24.995.52', 2)).toBe('24995.52')
  })
})

// El test que faltaba: TIPEAR, tecla por tecla, que es lo que hace una
// persona. Los casos de arriba prueban strings sueltos y por eso dejaron
// pasar el bug de los 5 dígitos: el string intermedio "2.5000" nunca se
// escribió a mano en un test porque nadie lo tipea a propósito — lo arma el
// propio campo al meter su punto de miles al cuarto dígito.
describe('tipear un monto desde cero, tecla por tecla', () => {
  /**
   * Lo que se ve en pantalla después de tipear `teclas` en un campo vacío.
   * Usa `reformatear`, que es lo que el componente le pasa al input en cada
   * tecla — `aDisplay(aRaw(...))` se come la coma colgante y no simula tipear.
   */
  const tipear = (teclas: string, decimales = 2) =>
    [...teclas].reduce((display, t) => reformatear(display + t, decimales), '')

  it('montos de cinco y seis cifras (el bug del 2026-09-21)', () => {
    expect(tipear('25000')).toBe('25.000')     // daba "2,50"
    expect(tipear('12345')).toBe('12.345')     // daba "1,23"
    expect(tipear('138382')).toBe('138.382')   // daba "1,38"
    expect(tipear('1500000')).toBe('1.500.000')
  })

  it('hasta cuatro cifras andaba, y tiene que seguir andando', () => {
    expect(tipear('9')).toBe('9')
    expect(tipear('99')).toBe('99')
    expect(tipear('999')).toBe('999')
    expect(tipear('9999')).toBe('9.999')
  })

  it('con centavos, tanto con punto como con coma', () => {
    expect(tipear('24994.52')).toBe('24.994,52')
    expect(tipear('24994,52')).toBe('24.994,52')
    expect(tipear('138382.40')).toBe('138.382,40')
  })

  it('y el raw que viaja al form es el número de verdad', () => {
    const raw = (teclas: string) =>
      [...teclas].reduce((d, t) => reformatear(d + t, 2), '')
    expect(aRaw(raw('25000'), 2)).toBe('25000')
    expect(Number(aRaw(raw('138382.40'), 2))).toBe(138382.4)
  })

  it('en un campo de enteros (decimales = 0) el punto nunca es decimal', () => {
    expect(tipear('25000', 0)).toBe('25.000')
  })
})

// El bug del NETO (2026-09-23): el casillero del precio neto de la compra
// acepta 4 decimales, y su propio punto de miles ("2.500") entraba como
// decimal. Estos tests simulan el componente de verdad: cada tecla pasa por
// interpretarCambio(lo que se veía, lo que quedó) y después por reformatear.
describe('el componente, tecla por tecla, sabiendo qué mostraba antes', () => {
  const paso = (display: string, texto: string, dec: number) =>
    reformatear(interpretarCambio(display, texto, dec), dec)
  const tipear = (teclas: string, dec: number) =>
    [...teclas].reduce((d, t) => paso(d, d + t, dec), '')
  // Lo que viaja al form: el componente manda aRaw(texto interpretado), no el display.
  const valor = (teclas: string, dec: number) => {
    let d = '', raw = ''
    for (const t of teclas) { const txt = interpretarCambio(d, d + t, dec); raw = aRaw(txt, dec); d = reformatear(txt, dec) }
    return Number(raw)
  }

  it('el neto (4 decimales) ya no divide por mil', () => {
    expect(valor('2500', 4)).toBe(2500)        // daba 2,5
    expect(valor('25000', 4)).toBe(25000)      // daba 2,5
    expect(valor('138382', 4)).toBe(138382)    // daba 1,3838
    expect(tipear('138382', 4)).toBe('138.382')
  })

  it('el neto con decimales, con punto o con coma', () => {
    expect(valor('4132.2314', 4)).toBe(4132.2314)
    expect(valor('4132,23', 4)).toBe(4132.23)
    expect(tipear('12500.5', 4)).toBe('12.500,5')
  })

  it('el final (2 decimales) sigue andando igual', () => {
    expect(valor('25000', 2)).toBe(25000)
    expect(valor('24994.52', 2)).toBe(24994.52)
    expect(valor('1500000', 2)).toBe(1500000)
  })

  it('agregar los centavos a un total que ya muestra los miles', () => {
    let d = '24.995'
    for (const t of ['.', '5', '2']) d = paso(d, d + t, 2)
    expect(d).toBe('24.995,52')
    expect(aRaw(interpretarCambio('24.995,5', '24.995,52', 2), 2)).toBe('24995.52')
  })

  it('el backspace no convierte los miles en decimales', () => {
    expect(paso('2.500', '2.50', 2)).toBe('250')
    expect(paso('25.000', '25.00', 4)).toBe('2.500')
    expect(paso('1.234,56', '1.234,5', 2)).toBe('1.234,5')
  })

  it('pegar o reemplazar todo usa la regla de siempre', () => {
    expect(paso('', '24994.52', 2)).toBe('24.994,52')
    expect(paso('2.500', '24994.52', 2)).toBe('24.994,52')
    expect(paso('2.500', '1.234.567,89', 2)).toBe('1.234.567,89')
    expect(paso('7', '1.234', 2)).toBe('1.234')
  })

  it('un segundo separador decimal se ignora', () => {
    expect(paso('12,5', '12,5.', 4)).toBe('12,5')
  })
})
