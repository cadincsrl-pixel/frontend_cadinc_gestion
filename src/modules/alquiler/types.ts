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
  // Vencimiento del seguro (yyyy-mm-dd) — se setea por el PATCH/POST normal.
  seguro_vence:   string | null
  // Póliza adjunta (storage path + nombre original) — se setea por endpoints
  // dedicados de upload/registro, no por el PATCH normal.
  seguro_poliza_path:   string | null
  seguro_poliza_nombre: string | null
  estado:         MaquinaEstado
  obs:            string | null
}

// Ficha de cliente (cuenta corriente del módulo Alquiler). Una obra apunta a
// uno de estos vía `cliente_id`. ABM en el tab Clientes.
export interface Cliente {
  id:       number
  nombre:   string
  cuit:     string | null
  contacto: string | null
  tel:      string | null
  email:    string | null
  obs:      string | null
}

export type ObraAlquilerEstado = 'activa' | 'cerrada'

export interface ObraAlquiler {
  id:                number
  nombre:            string
  // Cliente como ficha (fuente de verdad actual).
  cliente_id:        number | null
  // Legacy: cliente como texto libre. Se conserva como fallback de display.
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
  // Maquinista = trabajador del listado de personal (legajo). Es la fuente
  // principal de "quién opera la máquina".
  maquinista_leg:     string | null
  // Legacy (Fase 3): maquinista como usuario del sistema. Hoy la UI usa el leg.
  maquinista_user_id: string | null
  // Precio por hora de esta máquina en esta obra (cuenta corriente, Fase A).
  precio_hora:        number | null
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
  // Importe devengado del parte (horas × precio_hora) y el precio_hora vigente
  // de la asignación máquina↔obra (Fase B, cuenta corriente). null si la
  // asignación no tiene tarifa cargada. El backend ya los devuelve en getPartes.
  importe:        number | null
  precio_hora:    number | null
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
  // Cobro que canceló este remito (null = adeudado). FK ON DELETE SET NULL:
  // si se borra el cobro, el remito vuelve a adeudado.
  cobro_id:               number | null
}

// Remito enriquecido para cuenta corriente: suma el importe del parte 1:1
// (horas × $/h congelado). Lo devuelve GET /cuenta-corriente/:id/remitos.
export interface RemitoCliente extends RemitoAlquiler {
  importe: number | null
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

// Fila de la cuenta corriente por cliente (Fase C). El "devengado" es lo que
// se le debe facturar al cliente por el trabajo (horas × $/hora de cada
// máquina); los "cobros" es lo efectivamente cobrado en el período; el "saldo"
// es devengado − cobros (>0 = el cliente DEBE; <0 = a favor del cliente).
// El filtro de fecha aplica a AMBOS (devengado y cobros); sin filtro = saldo
// total acumulado. La devuelve GET /api/alquiler/cuenta-corriente, ordenada
// por saldo desc.
export interface CuentaCorrienteCliente {
  cliente_id:     number | null // null = "Sin cliente" (obras sin ficha)
  cliente_nombre: string        // ej. "Gaston Brignoli" o "Sin cliente"
  devengado:      number        // total $ devengado del cliente (todas sus obras en el rango)
  cobros:         number        // total $ cobrado en el período del filtro
  saldo:          number        // devengado − cobros
  obras: Array<{
    obra_id:     number
    obra_nombre: string
    devengado:   number
  }>
}

// ─────────────────────────── Cobros (Fase C) ───────────────────────────
// Un cobro registra plata efectivamente recibida de un cliente. Reduce el
// saldo de su cuenta corriente. NO está atado a una obra puntual (es a nivel
// cliente), por eso vive en su propio CRUD.
export type MedioCobro = 'efectivo' | 'transferencia' | 'cheque' | 'otro'

export interface Cobro {
  id:         number
  cliente_id: number
  fecha:      string   // 'YYYY-MM-DD'
  monto:      number
  medio:      MedioCobro
  obs:        string | null
}

export const MEDIO_COBRO_LABEL: Record<MedioCobro, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro',
}

export const MEDIO_COBRO_OPTIONS = (Object.keys(MEDIO_COBRO_LABEL) as MedioCobro[])
  .map(m => ({ value: m, label: MEDIO_COBRO_LABEL[m] }))

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
