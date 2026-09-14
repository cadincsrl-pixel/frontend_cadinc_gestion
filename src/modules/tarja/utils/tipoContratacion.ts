/**
 * TIPO DE CONTRATACIÓN de la obra (14/09).
 *
 * Hasta hoy acá se elegía sólo "quién pone los materiales", y el tercer tipo
 * —por administración— se prendía semanas después y desde OTRA pantalla, al
 * cargar los porcentajes en la cuenta corriente. El 14/09 eso hizo que una obra
 * cambiara de régimen sola, sin que nadie lo pidiera.
 *
 * Ahora es una sola pregunta, acá, al principio. No hay campo nuevo en la base:
 * el tipo se guarda en las dos banderas que ya existían, así que la pantalla y
 * la facturación no pueden decir cosas distintas.
 */
export type TipoContratacion = 'administracion' | 'llave_en_mano' | 'presupuesto'

export const TIPOS_CONTRATACION = [
  { value: 'presupuesto', label: 'Presupuesto cerrado — la mano de obra se cobra aparte; los materiales se le cobran al cliente' },
  { value: 'administracion', label: 'Por administración — se le cobra el costo + un % de operarios, contratistas y materiales' },
  { value: 'llave_en_mano', label: 'Llave en mano — CADINC pone todo; nada se le cobra al cliente' },
]

/** Las dos banderas que guardan el tipo. Una sola fuente de verdad. */
export function banderasDelTipo(t: TipoContratacion) {
  return {
    materiales_a_cargo_de: t === 'llave_en_mano' ? 'cadinc' as const : 'cliente' as const,
    por_administracion:    t === 'administracion',
  }
}

/** El camino inverso: qué tipo es una obra ya guardada. */
export function tipoDeLaObra(o: { materiales_a_cargo_de?: string | null; por_administracion?: boolean | null }): TipoContratacion {
  if (o.por_administracion) return 'administracion'
  if (o.materiales_a_cargo_de === 'cadinc') return 'llave_en_mano'
  return 'presupuesto'
}
