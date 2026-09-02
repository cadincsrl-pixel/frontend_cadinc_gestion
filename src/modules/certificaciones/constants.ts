/**
 * Unidades de medida del catálogo de materiales.
 *
 * Vivía triplicada en StockTab / SolicitudesTab / MaterialesTab, y las copias
 * NO eran iguales: solo StockTab tenía rollo/bolsa/balde/lata. Consecuencia:
 * un material catalogado en `balde` (ej. "Hidrófugo x 20lts") no podía
 * expresar su unidad al pedirlo desde una solicitud, porque el <select> de
 * ese formulario no tenía la opción. Al elegirlo del catálogo la unidad
 * quedaba fuera de la lista y se perdía en el primer cambio.
 *
 * Fuente única: esta lista. Agregar acá y aparece en los tres lugares.
 */
export const UNIDADES: { value: string; label: string }[] = [
  { value: 'unid',  label: 'Unid.' },
  { value: 'kg',    label: 'kg'    },
  { value: 'tn',    label: 'tn'    },
  { value: 'lt',    label: 'lt'    },
  { value: 'm',     label: 'm'     },
  { value: 'm2',    label: 'm²'    },
  { value: 'm3',    label: 'm³'    },
  { value: 'gl',    label: 'gl'    },
  { value: 'rollo', label: 'Rollo' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'balde', label: 'Balde' },
  { value: 'lata',  label: 'Lata'  },
]
