// Tipos del módulo "Alquiler de maquinaria" (Fase 1).
// Se mantienen acá (y no en el domain.types.ts compartido) para que el módulo
// quede cohesivo y no tocar un archivo de >1200 líneas. Si crecen y se
// comparten con otros módulos, se migran a domain.types.ts.

export type MaquinaTipo =
  | 'hidrogrua'
  | 'retropala'
  | 'minicargadora'
  | 'trailer_canasta'
  | 'otro'

export type MaquinaEstado = 'activa' | 'mantenimiento' | 'inactiva'

export interface Maquina {
  id:             number
  nombre:         string
  tipo:           MaquinaTipo
  identificacion: string | null
  estado:         MaquinaEstado
  obs:            string | null
}

export type ObraAlquilerEstado = 'activa' | 'cerrada'

export interface ObraAlquiler {
  id:                number
  nombre:            string
  cliente:           string | null
  ubicacion:         string | null
  descripcion:       string | null
  jefe_obra_user_id: string | null
  estado:            ObraAlquilerEstado
  fecha_inicio:      string | null
  obs:               string | null
}

// Fila de asignación máquina ↔ obra. El backend embebe la máquina.
export interface ObraMaquina {
  id:                 number
  obra_id:            number
  maquina_id:         number
  maquinista_user_id: string | null
  maquina:            Maquina
}

// El detalle de obra (GET /obras/:id) trae las máquinas asignadas embebidas.
export interface ObraAlquilerDetalle extends ObraAlquiler {
  maquinas: ObraMaquina[]
}

export interface Parte {
  id:             number
  obra_id:        number
  maquina_id:     number
  fecha:          string // yyyy-mm-dd
  manana_entrada: string | null // HH:MM o HH:MM:SS
  manana_salida:  string | null
  tarde_entrada:  string | null
  tarde_salida:   string | null
  horas:          number
  detalle:        string | null
  obs:            string | null
}

// ── Labels legibles ──
export const MAQUINA_TIPO_LABEL: Record<MaquinaTipo, string> = {
  hidrogrua:       'Hidrogrúa',
  retropala:       'Retropala',
  minicargadora:   'Minicargadora',
  trailer_canasta: 'Trailer con canasta',
  otro:            'Otro',
}

export const MAQUINA_TIPO_OPTIONS: { value: MaquinaTipo; label: string }[] = [
  { value: 'hidrogrua',       label: MAQUINA_TIPO_LABEL.hidrogrua },
  { value: 'retropala',       label: MAQUINA_TIPO_LABEL.retropala },
  { value: 'minicargadora',   label: MAQUINA_TIPO_LABEL.minicargadora },
  { value: 'trailer_canasta', label: MAQUINA_TIPO_LABEL.trailer_canasta },
  { value: 'otro',            label: MAQUINA_TIPO_LABEL.otro },
]

export const MAQUINA_ESTADO_LABEL: Record<MaquinaEstado, string> = {
  activa:        'Activa',
  mantenimiento: 'Mantenimiento',
  inactiva:      'Inactiva',
}

export const MAQUINA_ESTADO_OPTIONS: { value: MaquinaEstado; label: string }[] = [
  { value: 'activa',        label: MAQUINA_ESTADO_LABEL.activa },
  { value: 'mantenimiento', label: MAQUINA_ESTADO_LABEL.mantenimiento },
  { value: 'inactiva',      label: MAQUINA_ESTADO_LABEL.inactiva },
]

export const OBRA_ESTADO_LABEL: Record<ObraAlquilerEstado, string> = {
  activa:  'Activa',
  cerrada: 'Cerrada',
}

export const OBRA_ESTADO_OPTIONS: { value: ObraAlquilerEstado; label: string }[] = [
  { value: 'activa',  label: OBRA_ESTADO_LABEL.activa },
  { value: 'cerrada', label: OBRA_ESTADO_LABEL.cerrada },
]
