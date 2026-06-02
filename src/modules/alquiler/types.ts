// Tipos del módulo "Alquiler de maquinaria" (Fase 1).
// Se mantienen acá (y no en el domain.types.ts compartido) para que el módulo
// quede cohesivo y no tocar un archivo de >1200 líneas. Si crecen y se
// comparten con otros módulos, se migran a domain.types.ts.

export type MaquinaTipo =
  | 'cargadora_frontal'
  | 'retroexcavadora'
  | 'retropala'
  | 'excavadora'
  | 'miniexcavadora'
  | 'minicargadora'
  | 'motoniveladora'
  | 'topadora'
  | 'compactador'
  | 'pavimentadora'
  | 'manipulador_telescopico'
  | 'hidrogrua'
  | 'grua'
  | 'camion_volcador'
  | 'trailer_canasta'
  | 'otro'

export type MaquinaEstado = 'activa' | 'mantenimiento' | 'inactiva'

export interface Maquina {
  id:             number
  nombre:         string
  tipo:           MaquinaTipo
  identificacion: string | null
  seguro:         string | null
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

// Remito diario por máquina/día (Fase 2). 1:1 con el parte.
// El backend devuelve un snapshot desnormalizado (nombres de obra/máquina,
// horarios, etc.) para que el remito sea autocontenido al imprimirse.
export interface RemitoAlquiler {
  id:                     number
  numero:                 string        // 'RA-0001'
  parte_id:               number
  obra_id:                number | null
  maquina_id:             number | null
  fecha_trabajo:          string        // 'YYYY-MM-DD'
  obra_nombre:            string | null
  cliente:                string | null
  ubicacion:              string | null
  maquina_nombre:         string | null
  maquina_tipo:           string | null // 'hidrogrua' | 'retropala' | ... (string crudo del enum)
  maquina_identificacion: string | null
  manana_entrada:         string | null // 'HH:MM:SS' (columna SQL time)
  manana_salida:          string | null
  tarde_entrada:          string | null
  tarde_salida:           string | null
  horas:                  number
  detalle:                string | null
  fecha_emision:          string        // 'YYYY-MM-DD'
}

// Fila del reporte "Horas por máquina" (Fase 3). La devuelve el endpoint
// GET /api/alquiler/reportes/horas, ya ordenada por total_horas desc y
// scopeada por el backend.
export interface ReporteHoraMaquina {
  maquina_id:     number
  maquina_nombre: string | null
  maquina_tipo:   string | null // 'retropala' | 'hidrogrua' | ... (string crudo del enum)
  total_horas:    number
  dias:           number        // cantidad de días con carga
}

// ── Labels legibles ──
export const MAQUINA_TIPO_LABEL: Record<MaquinaTipo, string> = {
  cargadora_frontal:       'Cargadora frontal',
  retroexcavadora:         'Retroexcavadora',
  retropala:               'Retropala',
  excavadora:              'Excavadora',
  miniexcavadora:          'Miniexcavadora',
  minicargadora:           'Minicargadora',
  motoniveladora:          'Motoniveladora',
  topadora:                'Topadora (Bulldozer)',
  compactador:             'Compactador / Rodillo',
  pavimentadora:           'Pavimentadora',
  manipulador_telescopico: 'Manipulador telescópico',
  hidrogrua:               'Hidrogrúa',
  grua:                    'Grúa',
  camion_volcador:         'Camión volcador',
  trailer_canasta:         'Trailer con canasta',
  otro:                    'Otro',
}

// Orden del dropdown: máquinas viales más comunes primero, "Otro" al final.
export const MAQUINA_TIPO_OPTIONS: { value: MaquinaTipo; label: string }[] = [
  'cargadora_frontal',
  'retroexcavadora',
  'retropala',
  'excavadora',
  'miniexcavadora',
  'minicargadora',
  'motoniveladora',
  'topadora',
  'compactador',
  'pavimentadora',
  'manipulador_telescopico',
  'hidrogrua',
  'grua',
  'camion_volcador',
  'trailer_canasta',
  'otro',
].map(t => ({ value: t as MaquinaTipo, label: MAQUINA_TIPO_LABEL[t as MaquinaTipo] }))

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
