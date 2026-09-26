import type { ArcaAmbienteInfo, CertificadoArca } from './config.types'

// ── Auditoría ──
export interface AuditFields {
  created_at?: string | null
  updated_at?: string | null
  created_by?: string | null
  updated_by?: string | null
}

// ── Obras ──
export interface Obra extends AuditFields {
  cod: string
  nom: string
  /**
   * @deprecated Nombre del cliente tipeado a mano. Desde el 2026-09-23 cada
   * obra es su propio centro de costo y el cliente sale de `cliente_id`.
   */
  cc: string | null
  /** El cliente de la obra (`ventas_clientes`). null = obra sin cliente cargado. */
  cliente_id?: number | null
  /** Su razón social, aplanada por el backend en GET /api/obras. */
  cliente_nom?: string | null
  dir: string | null
  resp: string | null
  obs: string | null
  archivada: boolean
  fecha_archivo: string | null
  es_deposito: boolean
  /**
   * Destino interno de CADINC (2026-09-08): el pañol y la oficina,
   * mantenimiento, herreros, logística, poda. Lo que se les despacha es gasto
   * propio y se lee en la pestaña "Gasto interno". Distinto de `es_deposito`,
   * que marca el galpón donde vive el stock: un centro interno consume, el
   * depósito guarda.
   */
  es_interna: boolean
  /**
   * La obra se factura por administración (2026-09-08): al cliente se le cobra
   * el costo de cada pata (operarios, contratistas, materiales) más un
   * porcentaje pactado. Los porcentajes viven versionados en
   * `obras_admin_tarifas`; este flag prende la vista de administración en la
   * cuenta corriente.
   */
  por_administracion: boolean
  /**
   * Quién se hace cargo de los materiales (20260904ak). 'cliente': se cobran
   * en la cuenta del cliente. 'cadinc': obra llave en mano, todo es gasto de
   * CADINC. Cambiarlo recalcula la cuenta (trigger en la base).
   */
  materiales_a_cargo_de: MaterialesACargoDe
  // FK a profiles(id). Cuando se setean, el backend auto-asigna la
  // obra al user en `usuario_obras` (modulo=NULL), de modo que
  // capataces y jefes de obra ven sus obras automáticamente.
  capataz_user_id?:   string | null
  jefe_obra_user_id?: string | null
}

// El `cod` se autogenera en el backend vía la RPC `siguiente_codigo_obra`.
// El cliente NO lo manda — si lo manda, el zod lo dropea silenciosamente.
export interface CreateObraDto {
  nom: string
  cc?: string
  dir?: string
  resp?: string
  obs?: string
  capataz_user_id?:   string | null
  jefe_obra_user_id?: string | null
  materiales_a_cargo_de?: MaterialesACargoDe
  /** Tipo de contratación, junto con el campo de arriba (14/09). */
  por_administracion?: boolean
}

export interface UpdateObraDto {
  nom?: string
  cc?: string
  dir?: string
  resp?: string
  obs?: string
  capataz_user_id?:   string | null
  jefe_obra_user_id?: string | null
  materiales_a_cargo_de?: MaterialesACargoDe
  /** Tipo de contratación, junto con el campo de arriba (14/09). */
  por_administracion?: boolean
}

// ── Personal ──
export interface CatHistorial {
  cat_id: number
  desde: string
}

export type PersonalModalidad = 'hora' | 'mes'

export type PadronExterno = 'oficina' | 'chofer' | 'contratista'

export interface Personal extends AuditFields {
  leg: string
  nom: string
  dni: string | null
  condicion: 'blanco' | 'asegurado' | null
  modalidad: PersonalModalidad
  cat_id: number
  tel: string | null
  dir: string | null
  obs: string | null
  talle_pantalon:  string | null
  talle_botines:   string | null
  talle_camisa:    string | null
  activo_override: boolean | null
  fecha_nacimiento: string | null   // ISO yyyy-mm-dd
  /**
   * NULL = operario de obra. Con valor, la ficha real de la persona vive en
   * otro padrón y este legajo existe solo por su historia. Filtrar con
   * `esOperario()`, nunca con `activo_override`.
   */
  padron_externo: PadronExterno | null
  personal_cat_historial: CatHistorial[]
}

export interface CreatePersonalDto {
  leg: string
  nom: string
  dni?: string
  condicion?: 'blanco' | 'asegurado' | null
  modalidad?: PersonalModalidad
  cat_id: number
  tel?: string
  dir?: string
  obs?: string
  talle_pantalon?: string
  talle_botines?:  string
  talle_camisa?:   string
  fecha_nacimiento?: string | null
}

export interface UpdatePersonalDto {
  nom?: string
  dni?: string
  condicion?: 'blanco' | 'asegurado' | null
  modalidad?: PersonalModalidad
  cat_id?: number
  tel?: string
  dir?: string
  obs?: string
  talle_pantalon?:  string
  talle_botines?:   string
  talle_camisa?:    string
  activo_override?: boolean | null
  fecha_nacimiento?: string | null
  /** Viernes desde el que rige la categoría nueva (solo si cambia cat_id). Default: semana en curso. */
  cat_desde?: string
  /** Aplicar el cambio de categoría aunque recalcule semanas cerradas (409 AFECTA_SEMANAS_CERRADAS). */
  confirmar_historico?: boolean
}

/** Fila de GET /api/personal/actividad (RPC personal_actividad). */
export interface ActividadLeg {
  leg: string
  ultima_fecha: string | null            // último día con horas > 0
  obras_ultima_semana: string[] | null   // obras de esa semana (vie→jue)
  filas_desde: number                    // filas de horas desde el corte de "activo"
}

/** Fila de GET /api/horas/resumen-obras (RPC obras_actividad). */
export interface ResumenObra {
  obra_cod: string
  hs_semana: number
  trabajadores_semana: number
  hs_total: number
  trabajadores_total: number
  ultima_actividad: string | null
  ultima_carga_por: string | null
}

// ── Documentos del legajo ──
export type PersonalDocTipo = 'dni' | 'alta_temprana' | 'baja' | 'telegrama'

export interface PersonalDocumento {
  id:             number
  leg:            string
  tipo:           PersonalDocTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
}

// ── Adjuntos del cobro (liquidación líquido producto / factura emitida +
// comprobante + contra factura de la comisión del intermediario +
// certificados de retención que la empresa manda con el pago) ──
export type CobroAdjuntoTipo = 'liquidacion' | 'comprobante' | 'factura' | 'contra_factura' | 'retencion'

export interface CobroAdjunto {
  id:             number
  cobro_id:       number
  tipo:           CobroAdjuntoTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
  /** Lectura de cheques para la cartera (20260930h/j). null = este tipo no se lee. */
  cheques_lectura?:    'leyendo' | 'ok' | 'sin_cheques' | 'error' | null
  cheques_resultado?:  { nuevos?: number; ya_estaban?: number; endosados?: number; motivo?: string; modelo?: string } | null
  cheques_lectura_at?: string | null
}

/** Un cheque de la cartera de cheques recibidos (`cheques_recibidos`, 20260930f). */
export interface ChequeRecibido {
  id:               number
  numero:           string
  banco:            string | null
  librador:         string | null
  librador_cuit:    string | null
  fecha_cobro:      string | null
  importe:          number
  es_echeq:         boolean | null
  estado:           'en_cartera' | 'endosado' | 'depositado' | 'rechazado' | 'recuperado'
  obs:              string | null
  cobro_adjunto_id: number | null
  created_at:       string
}

/** Una fila de `v_cheques_recibidos` (20260930n): el cheque con su origen y su destino. */
export interface ChequeRecibidoFila extends ChequeRecibido {
  origen:            'logistica_cobro' | 'ventas_cobro' | 'manual'
  cobro_id:          number | null
  ventas_cobro_id:   number | null
  recibido_de:       string | null
  recibido_el:       string | null
  orden_id:          number | null
  op_numero:         number | null
  op_fecha:          string | null
  proveedor_nombre:  string | null
  vencido:           boolean
  /** Depósito / rechazo / recupero (20260930o). */
  deposito_cuenta:   string | null
  fecha_deposito:    string | null
  rechazo_fecha:     string | null
  rechazo_motivo:    string | null
  recupero_fecha:    string | null
  recupero_obs:      string | null
}

export interface ChequesRecibidosRes {
  items:  ChequeRecibidoFila[]
  total:  number
  limit:  number
  offset: number
  totales: Record<string, { cantidad: number; importe: number }>
}

export interface ChequeAManoInput {
  numero:       string
  banco?:       string | null
  librador?:    string | null
  fecha_cobro?: string | null
  importe:      number
  es_echeq?:    boolean | null
}

export interface CargarChequesRes {
  nuevos: number
  ya_estaban: number
  endosados: number
  ya_estaban_numeros?: string[]
}

// ── Relevo de chofer en un tramo (típicamente en Chivilcoy) ──
export interface TramoChofer {
  id:             number
  tramo_id:       number
  chofer_id:      number
  orden:          1 | 2
  km_cargado:     number
  km_vacio:       number
  jornales:       number
  lugar_relevo:   string | null
  obs:            string | null
  liquidacion_id: number | null
  created_at:     string
  updated_at:     string
}

// Fila de relevo YA liquidada (liquidacion_id seteado), con el camión/tipo del
// tramo embebido. La usa el reporte de gastos para imputar la MO del relevista
// al camión real del viaje. La trae /api/logistica/tramos/relevos-liquidados.
export interface RelevoLiquidado {
  id:             number
  tramo_id:       number
  liquidacion_id: number
  chofer_id:      number
  km_cargado:     number
  km_vacio:       number
  tramo: { camion_id: number; tipo: 'cargado' | 'vacio' } | null
}

// Fila de relevo pendiente de liquidar, con el tramo embebido (la trae el
// endpoint /api/logistica/tramos/relevos-pendientes). Cada chofer del relevo
// cobra su pata (km de su fila) + jornal, vía su propia liquidación.
export interface RelevoPendiente {
  id:          number
  tramo_id:    number
  chofer_id:   number
  orden:       1 | 2
  km_cargado:  number
  km_vacio:    number
  jornales:    number
  tramo: {
    id:             number
    tipo:           'cargado' | 'vacio'
    estado:         string
    camion_id:      number
    cantera_id:     number | null
    deposito_id:    number | null
    fecha_carga:    string | null
    fecha_descarga: string | null
    fecha_vacio:    string | null
  } | null
}

export interface RelevoSugerencia {
  encontrado: boolean
  lugar:      string
  km1?:       number
  km2?:       number
  motivo?:    string
  metodo?:    'suma' | 'resta'
}

// ── Adjuntos de la liquidación (comprobante de pago + recibo firmado) ──
export type LiquidacionAdjuntoTipo = 'comprobante_pago' | 'recibo_firmado'

export interface LiquidacionAdjunto {
  id:             number
  liquidacion_id: number
  tipo:           LiquidacionAdjuntoTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
}

// ── Documentos del legajo de chofer ──
export type ChoferDocTipo =
  | 'dni' | 'licencia_conducir' | 'alta_temprana' | 'lnh' | 'cnrt'
  | 'aptitud_psicofisica' | 'art' | 'mopp' | 'cuil_afip' | 'cbu_bancario'
  | 'telegrama' | 'otro'

export interface ChoferDocumento {
  id:             number
  chofer_id:      number
  tipo:           ChoferDocTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  vence_el:       string | null   // YYYY-MM-DD, solo para tipos con expiración
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
}

// ── Categorías ──
// `vh` es cache del precio de la ÚLTIMA versión del historial. El precio
// vigente a una fecha se resuelve con getVHGlobalEnFecha (costos.ts) sobre
// `categoria_tarifas` (versionado por `desde`, mismo esquema que Tarifa).
export interface CategoriaTarifa {
  id: number
  vh: number
  desde: string
}

export interface Categoria {
  id: number
  nom: string
  vh: number
  categoria_tarifas?: CategoriaTarifa[]
}

export interface CreateCategoriaDto {
  nom: string
  vh: number
}

export interface UpdateCategoriaDto {
  nom?: string
  vh?: number
  desde?: string   // vigencia del nuevo precio (YYYY-MM-DD, viernes de semana)
  /** true = el usuario confirmó que el precio recalcula semanas ya cerradas (409 AFECTA_SEMANAS_CERRADAS). */
  confirmar_historico?: boolean
}

// ── Horas ──
export interface Hora extends AuditFields {
  id: number
  obra_cod: string
  fecha: string
  leg: string
  horas: number
}

export interface UpsertHoraDto {
  obra_cod: string
  fecha: string
  leg: string
  horas: number
}

export interface UpsertHorasLoteDto {
  obra_cod: string
  horas: Array<{
    fecha: string
    leg: string
    horas: number
  }>
  // true = placeholders (0hs): solo inserta filas nuevas, nunca pisa una
  // existente (backend: upsert con ignoreDuplicates).
  solo_nuevas?: boolean
}

// ── Tarifas ──
export interface Tarifa extends AuditFields {
  id: number
  obra_cod: string
  cat_id: number
  /** null = desde ese viernes vuelve a regir el precio global de la categoría. */
  vh: number | null
  desde: string
}

// ── Cierres ──
export type CierreEstado = 'pendiente' | 'cerrado'

export interface Cierre extends AuditFields {
  id: number
  obra_cod: string
  sem_key: string
  estado: CierreEstado
  cerrado_en: string | null
}

// ── Contratistas ──
export interface Contratista extends AuditFields {
  id: number
  nom: string
  razon_social: string | null
  especialidad: string | null
  tel: string | null
  cuit: string | null
  cuil: string | null
  dni: string | null
  dni_doc_path: string | null
  dni_doc_nombre: string | null
  banco_cuenta: string | null
  cbu: string | null
  alias_cbu: string | null
  titular_cuenta: string | null
  obs: string | null
}

// Asignación contratista×obra. `finalizado_en` marca que el contratista ya no
// trabaja en la obra: no se ofrece al certificar y su historial queda intacto.
// NULL = activo. Reemplaza al "desasignar" cuando hay certificaciones o
// presupuestos cargados (sin historial, desasignar borra la fila como siempre).
// El backend nunca devuelve cotizacion* (modelo viejo, se dropea en fase 2).
export interface AsigContratista extends AuditFields {
  obra_cod: string
  contrat_id: number
  finalizado_en: string | null
  contratistas: Contratista
}

// Presupuesto de un contratista en una obra (N por asignación). Cada
// certificación semanal se imputa a uno; saldo = monto − Σ certs del presupuesto.
// `cerrado_en` NULL = abierto (se ofrece al certificar); se puede reabrir.
// Adjunto (foto/PDF) en bucket privado `contratista-docs` bajo presupuesto/{id}/.
// Solo lo ve quien tiene ver_costos (el backend responde 403; el hook lo trata como []).
export interface Presupuesto extends AuditFields {
  id: number
  obra_cod: string
  contrat_id: number
  titulo: string
  monto: number
  fecha: string              // YYYY-MM-DD: fecha del presupuesto del contratista
  obs: string | null
  cerrado_en: string | null
  doc_path: string | null
  doc_nombre: string | null
}

// ── Certificaciones ──
// Certificación semanal de un contratista. No tiene estado: se paga sí o sí el
// viernes de cobro (getViernesCobro(sem_key) = sem_key + 7), igual que a los
// operarios. `presupuesto_id` NULL = histórica sin presupuesto (permitida solo
// si el contratista no tiene presupuestos abiertos en la obra; lo valida el
// backend). Identidad: 1 por (obra, contratista, semana, presupuesto).
export interface Certificacion extends AuditFields {
  id: number
  obra_cod: string
  contrat_id: number
  sem_key: string
  monto: number
  desc: string
  presupuesto_id: number | null
  presupuesto_titulo: string | null   // lo embebe el backend desde contrat_presupuestos
}

export type ChoferEstado = 'activo' | 'descanso' | 'inactivo'
export type CamionEstado = 'activo' | 'mantenimiento' | 'inactivo'
export type ViajeEstado  = 'en_curso' | 'completado'
// 'anulada' = liquidación cerrada que quedó sin contenido y se sacó de
// circulación dejando rastro, en vez de borrarla (su número ya salió impreso en
// recibos). No la cuenta ningún reporte ni tiene PDF. Migración 20260729e.
export type LiqEstado    = 'borrador' | 'cerrada' | 'anulada'

export interface Chofer extends AuditFields {
  id: number
  nombre: string
  cuil: string | null
  tel: string | null
  licencia: string | null
  alias: string | null
  cbu: string | null
  estado: ChoferEstado
  camion_id: number | null
  batea_id: number | null
  basico_dia: number
  precio_km_cargado: number
  precio_km_vacio: number
  obs: string | null
  // false = fletero externo, no está en la nómina de CADINC. Excluido de
  // Gastos > Reportes (migración 20260729f).
  es_propio?: boolean
  // km_jornal (default): básico/día + km × tarifa. pct: % de la facturación
  // neta de sus viajes + jornal opcional (basico_dia; 0 = solo %).
  modalidad_pago?: 'km_jornal' | 'pct'
  // Cache de la última versión de choferes_pct_hist — para cálculos con fecha
  // usar el historial (tarifas-chofer.ts), nunca este campo.
  pct_facturacion?: number
}

// tractor = arrastra batea/semirremolque; chasis = caja fija. Discrimina la
// tarifa por tipo de unidad en facturación (chasis paga distinto).
export type CamionCategoria = 'tractor' | 'chasis'

export interface Camion extends AuditFields {
  id: number
  patente: string
  modelo: string | null
  anio: number | null
  estado: CamionEstado
  categoria: CamionCategoria
  /**
   * Configuración de la unidad para la solicitud de turno: escalable (hasta
   * 35 tn) o estándar (hasta 31 tn). Dato INFORMATIVO: no valida ni calcula
   * nada. Para cualquier cálculo, la capacidad que manda es `bateas.capacidad_tn`.
   * null = sin definir.
   */
  tipo_carga: 'escalable' | 'estandar' | null
  km_actuales: number
  obs: string | null
  // GPS Mobile Quest (todos opcionales: solo se llenan si hay mapeo)
  id_vehiculo_gps:        string | null
  km_actualizado_en:      string | null
  gps_ultima_lat:         number | null
  gps_ultima_lng:         number | null
  gps_ultima_velocidad:   number | null
  gps_ultima_lectura_en:  string | null
  gps_ultimo_sync_en:     string | null
  gps_ultimo_sync_estado: GpsSyncEstado | null
  gps_ultimo_sync_error:  string | null
  // false = camión de un fletero: se le factura el viaje pero el equipo no es de
  // CADINC y los gastos los pone él. Excluido de Gastos > Reportes
  // (migración 20260729f).
  es_propio?: boolean
  // Vencimiento de la RTO vigente (lo adjunta el backend en getAll; null si
  // el camión no tiene RTO cargada en Documentos). Espejo de Batea.
  rto_vence_el?: string | null
}

// ── GPS Sync ──
export type GpsSyncEstado = 'ok' | 'error' | 'no_match' | 'sin_cambio'
export type GpsSyncTipo   = 'manual_individual' | 'manual_global' | 'cron'

export interface GpsSyncLog {
  id:               number
  camion_id:        number | null
  id_vehiculo_gps:  string | null
  patente_gps:      string | null
  tipo:             GpsSyncTipo
  estado:           GpsSyncEstado
  km_anterior:      number | null
  km_nuevo:         number | null
  velocidad:        number | null
  lectura_gps_en:   string | null
  error_mensaje:    string | null
  duracion_ms:      number | null
  created_at:       string
  created_by:       string | null
}

// ── Service de camiones ──
export interface CamionService {
  id: number
  camion_id: number
  fecha: string
  km_service: number
  km_proximo: number
  obs: string | null
  comprobante_url: string | null
  comprobante_hash: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

/** Cubiertas puestas a un camión. Registro histórico en el legajo, sin alerta
 *  ni costo: el gasto se carga aparte. La diferencia de `km_camion` entre un
 *  registro y el anterior es la vida útil real del juego. */
export interface CamionCubiertas {
  id: number
  camion_id: number
  fecha: string
  km_camion: number
  cantidad: number
  obs: string | null
  created_at: string
  updated_at: string
}

export type CamionServiceEstadoKey = 'sin_service' | 'al_dia' | 'proximo' | 'vencido'

export interface CamionServiceEstado {
  camion_id: number
  patente: string
  km_actuales: number
  fecha_ultimo_service: string | null
  km_ultimo_service: number | null
  km_proximo_service: number | null
  comprobante_ultimo_service: string | null
  estado: CamionServiceEstadoKey
  km_restantes: number | null
}

// ── Remolques (tabla `bateas` — la UI dice "remolques") ──
// Tipo de remolque, vocabulario real de la flota (unificado 2026-07-15).
export type BateaTipo = 'batea' | 'acoplado' | 'semirremolque' | 'sider' | 'tanque_cisterna' | 'otro'
export type BateaEstado = 'activo' | 'mantenimiento' | 'inactivo'

export interface Batea extends AuditFields {
  id:           number
  patente:      string
  tipo:         BateaTipo | null
  marca:        string | null
  modelo:       string | null
  anio:         number | null
  capacidad_m3: number | null
  capacidad_tn: number | null
  titular:      string | null
  estado:       BateaEstado
  obs:          string | null
  // Vencimiento de la RTO vigente (lo adjunta el backend en getAll; null si
  // la batea no tiene RTO cargada en Documentos).
  rto_vence_el?: string | null
}

// ── Documentos del vehículo (camión y batea, mismo schema) ──
// Unión de los tipos de TODAS las entidades. Cada una acepta un subconjunto:
// camión/batea los 6 primeros, máquina de alquiler y unidad de áridos los 8 de
// flota. La lista por entidad vive en TIPOS_POR_ENTIDAD (EntidadDocumentosSection).
export type VehiculoDocTipo =
  | 'titulo' | 'tarjeta_verde' | 'rto' | 'poliza_seguro'
  | 'homologacion' | 'registro_modificacion'
  | 'vtv' | 'patente' | 'oblea' | 'otro'
// Entidades que tienen documentación con vencimiento. Espejo de `Entidad` del
// backend (`modules/documentos/entidad-docs.service.ts`).
export type VehiculoEntidad = 'camion' | 'batea' | 'maquina' | 'unidad'

export interface VehiculoDocumento {
  id:             number
  camion_id?:     number   // sólo en camion_documentos
  batea_id?:      number   // sólo en batea_documentos
  tipo:           VehiculoDocTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  vence_el:       string | null
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
}

// ── Módulo Flota CADINC (vehículos internos: autos, camionetas, utilitarios) ──
// Separado de camiones/bateas (logística). Documentos tienen tipos propios
// y bucket distinto (`flota-docs`).
export type FlotaVehiculoTipo  = 'auto' | 'camioneta' | 'utilitario' | 'pickup' | 'moto' | 'otro'
export type FlotaVehiculoEstado = 'activo' | 'taller' | 'baja'
export type FlotaDocTipo =
  | 'titulo' | 'tarjeta_verde' | 'vtv' | 'rto'
  | 'poliza_seguro' | 'patente' | 'oblea' | 'otro'

// Estado del último sync de GPS para un vehículo.
// Refleja el outcome del último intento de MobilQuest:
//   - `ok`         → llegó lectura nueva y se actualizó km.
//   - `sin_cambio` → llegó lectura pero el km no avanzó (auto detenido, etc).
//   - `error`      → falló el patch contra DB (raro).
//   - `no_match`   → MobilQuest no devolvió lecturas para ese device_id.
export type FlotaGpsSyncEstado = 'ok' | 'sin_cambio' | 'error' | 'no_match'

export interface FlotaVehiculo {
  id:                          number
  patente:                     string
  tipo:                        FlotaVehiculoTipo
  marca:                       string | null
  modelo:                      string | null
  anio:                        number | null
  color:                       string | null
  vin:                         string | null
  titular:                     string | null
  km_actuales:                 number
  estado:                      FlotaVehiculoEstado
  mobilquest_device_id:        string | null
  mobilquest_alias:            string | null
  mobilquest_ultima_sync_at:   string | null
  // ── Cache del último sync de GPS (denormalizado para no joinear con el log) ──
  gps_ultima_lat?:             number | null
  gps_ultima_lng?:             number | null
  gps_ultima_velocidad?:       number | null
  gps_ultima_lectura_en?:      string | null
  gps_ultimo_sync_estado?:     FlotaGpsSyncEstado | null
  gps_ultimo_sync_error?:      string | null
  km_actualizado_en?:          string | null
  obs:                         string | null
  created_by:                  string | null
  created_at:                  string
  updated_by:                  string | null
  updated_at:                  string
}

// Bitácora de cada intento de sync (uno por vehículo por ciclo).
// `tipo` es el disparador: 'manual_global' | 'manual_individual' | 'cron'.
export interface FlotaGpsSyncLog {
  id:               number
  vehiculo_id:      number | null
  id_vehiculo_gps:  string | null
  patente_gps:      string | null
  tipo:             string
  estado:           FlotaGpsSyncEstado
  km_anterior:      number | null
  km_nuevo:         number | null
  velocidad:        number | null
  lectura_gps_en:   string | null
  error_mensaje:    string | null
  duracion_ms:      number | null
  created_at:       string
  created_by:       string | null
}

// Resumen devuelto por POST /api/flota/gps/sync-todos.
export interface FlotaGpsSyncResumen {
  total:       number
  ok:          number
  sin_cambio:  number
  no_match:    number
  error:       number
  duracion_ms: number
}

// Respuesta de POST /api/flota/gps/sync/:vehiculo_id.
export interface FlotaGpsSyncIndividualResp {
  vehiculo:  FlotaVehiculo
  resultado: {
    vehiculo_id:     number | null
    id_vehiculo_gps: string
    patente_gps:     string | null
    estado:          FlotaGpsSyncEstado
    km_anterior:     number | null
    km_nuevo:        number | null
    error_mensaje:   string | null
  }
}

export interface FlotaDocumento {
  id:             number
  vehiculo_id:    number
  tipo:           FlotaDocTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  numero_serie:   string | null
  vence_el:       string | null
  obs:            string | null
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
}

export interface FlotaTipoServicio {
  id:               number
  nombre:           string
  intervalo_km:     number | null
  intervalo_meses:  number | null
  activo:           boolean
  created_at:       string
}

export interface FlotaServicio {
  id:                number
  vehiculo_id:       number
  tipo_id:           number | null
  tipo_libre:        string | null
  fecha:             string
  km_service:        number
  km_proximo:        number | null
  fecha_proximo:     string | null
  descripcion:       string | null
  costo:             number | null
  proveedor:         string | null
  comprobante_path:  string | null
  obs:               string | null
  created_at:        string
  created_by:        string | null
  updated_at:        string
  updated_by:        string | null
}

export type FlotaServicioEstado = 'sin_service' | 'vencido' | 'proximo' | 'al_dia'

// ── Gastos (combustible, peajes, lavado, multas, etc) ──
export interface FlotaGastoCategoria {
  id:     number
  codigo: string
  nombre: string
  icono:  string | null
  orden:  number
  activo: boolean
}

export interface FlotaGasto {
  id:                number
  vehiculo_id:       number
  categoria_id:      number | null
  categoria?:        Pick<FlotaGastoCategoria, 'id' | 'codigo' | 'nombre' | 'icono'> | null
  fecha:             string
  monto:             number
  proveedor:         string | null
  descripcion:       string | null
  comprobante_path:  string | null
  comprobante_hash:  string | null
  created_at:        string
  created_by:        string | null
  updated_at:        string
  updated_by:        string | null
  deleted_at:        string | null
}

export interface FlotaServicioEstadoRow {
  vehiculo_id:           number
  patente:               string
  km_actuales:           number
  fecha_ultimo_service:  string | null
  km_ultimo_service:     number | null
  km_proximo:            number | null
  fecha_proximo:         string | null
  tipo_id_proximo:       number | null
  estado:                FlotaServicioEstado
  km_restantes:          number | null
  dias_restantes:        number | null
}

export interface Cantera {
  id: number
  nombre: string
  localidad: string | null
  maps_url: string | null
  obs: string | null
  lat: number | null
  lng: number | null
  // Lugar operativo (mantenimiento/relevos/parking): no facturable, no puede
  // ser origen/destino de un tramo cargado.
  operativo: boolean
}

export interface Deposito {
  id: number
  nombre: string
  localidad: string | null
  maps_url: string | null
  obs: string | null
  lat: number | null
  lng: number | null
  operativo: boolean
}

/**
 * Lugar operativo (mantenimiento/relevos/estacionamiento, p.ej. CHIVILCOY).
 * Gestionado como un concepto único; por detrás es el par cantera+depósito
 * (ambos `operativo`) al que apunta.
 */
export interface LugarOperativo {
  id:          number
  nombre:      string
  cantera_id:  number
  deposito_id: number
  obs:         string | null
  // Geo del par cantera+depósito (sincronizada), aplanada por el backend.
  localidad:   string | null
  maps_url:    string | null
  lat:         number | null
  lng:         number | null
}

export interface Ruta {
  id: number
  cantera_id: number
  deposito_id: number
  km_ida_vuelta: number
  obs: string | null
  /** false = el km lo sugirió Google y nadie lo revisó todavía contra el mapa.
   *  Se paga igual: la matriz lo marca y el modal de liquidar lo avisa. */
  verificada: boolean
  verificada_en:  string | null
  verificada_por: string | null
  origen_km: 'manual' | 'google'
  canteras?: { nombre: string }
  depositos?: { nombre: string }
}

export interface Carga {
  id: number
  viaje_id: number
  fecha: string
  cantera_id: number
  toneladas: number | null
  remito_num: string | null
  remito_url: string | null
  obs: string | null
}

export interface Descarga {
  id: number
  viaje_id: number
  fecha: string
  deposito_id: number
  toneladas: number | null
  remito_num: string | null
  remito_url: string | null
  obs: string | null
}

export interface Viaje {
  id: number
  chofer_id: number
  camion_id: number
  estado: ViajeEstado
  obs: string | null
  created_at: string
  cargas: Carga[]
  descargas: Descarga[]
}

export type TramoTipo   = 'cargado' | 'vacio'
export type TramoEstado = 'en_curso' | 'completado'

export interface Tramo {
  id:          number
  /** Qué se transportó: maíz, soja, harina de soja, arena… Solo en cargados.
   *  El cliente identifica el viaje por acá al discutir la facturación. */
  producto?:   string | null
  chofer_id:   number
  camion_id:   number
  tipo:        TramoTipo
  estado:      TramoEstado
  empresa_id:  number | null
  cantera_id:  number | null   // origen en cargado, destino en vacio
  deposito_id: number | null   // destino en cargado, origen en vacio
  // Qué variante de tarifa factura este tramo (cuando la ruta tiene más de una
  // en tarifas_empresa_cantera.variante). null = tarifa base/única.
  tarifa_variante: string | null

  // Carga
  fecha_carga:          string | null
  toneladas_carga:      number | null
  remito_carga:         string | null
  remito_carga_img_url: string | null

  // Descarga
  fecha_descarga:          string | null
  toneladas_descarga:      number | null
  remito_descarga:         string | null
  remito_descarga_img_url: string | null

  // Vacío
  fecha_vacio: string | null

  liquidacion_id: number | null
  cobro_id:       number | null
  // Monto (CON IVA) que la empresa intermediaria contra facturó por este viaje.
  // Resta del bruto antes de netear la base del chofer pct. null = todavía no
  // llegó la contra factura. Solo aplica a empresas con contra_factura=true.
  comision_intermediario: number | null
  obs:            string | null
  orden_dia:      number | null
  created_at:  string
  updated_at:  string
  created_by:  string | null
  updated_by:  string | null
}

export interface Liquidacion {
  id: number
  chofer_id: number
  fecha_desde: string
  fecha_hasta: string
  dias_trabajados: number
  basico_dia: number
  km_totales: number | null
  precio_km: number | null
  subtotal_basico: number
  subtotal_km: number | null
  subtotal_km_cargado: number | null
  subtotal_km_vacio:   number | null
  total_adelantos: number
  total_reintegros: number | null
  // Estadías: días de espera para cargar/descargar pagados por día (suman).
  total_estadias: number | null
  total_neto: number
  estado: LiqEstado
  obs: string | null
  created_at: string
  // Snapshot de la modalidad al liquidar (migración 20260730b). En 'pct':
  // subtotal_pct = base_neta × pct_aplicado/100 y los subtotales de km van null.
  modalidad?: 'km_jornal' | 'pct'
  pct_aplicado?: number | null
  base_neta?: number | null
  subtotal_pct?: number | null
  // Rastro de la anulación (solo con estado='anulada').
  // Cuándo se cerró (la setea cerrar_liquidacion; reabrir la limpia).
  cerrada_en?:       string | null
  anulada_en?:       string | null
  anulada_por?:      string | null
  anulacion_motivo?: string | null
}

// Respuesta del endpoint PATCH /api/logistica/liquidaciones/:id/cerrar:
// la liquidación cerrada + el adelanto automático generado cuando el neto
// dio negativo (null si el neto fue >= 0).
export interface CerrarLiquidacionResp extends Liquidacion {
  adelanto_saldo: { id: number; monto: number } | null
}

// 'saldo' NO es una entrega de dinero: lo crea el sistema al cerrar una
// liquidación con neto negativo (la deuda del chofer pasa a la próxima).
// Sólo el backend puede generarlo; la UI ofrece efectivo/transferencia.
export type AdelantoFormaPago = 'transferencia' | 'efectivo' | 'saldo'

export interface Adelanto {
  id: number
  chofer_id: number
  fecha: string
  monto: number
  descripcion: string | null
  forma_pago: AdelantoFormaPago
  /** Liquidación en la que este adelanto FUE DESCONTADO (null = pendiente). */
  liquidacion_id: number | null
  /** Liquidación de cuyo cierre negativo NACIÓ este adelanto (null = adelanto normal). */
  liquidacion_origen_id: number | null
  comprobante_url:  string | null
  comprobante_hash: string | null
}

// Estadía: días extra que el chofer perdió esperando para cargar/descargar,
// pagados por día aparte del básico. NULL en liquidacion_id = pendiente.
export interface Estadia {
  id: number
  chofer_id: number
  fecha_desde: string
  fecha_hasta: string
  dias: number
  monto_dia: number
  total: number
  obs: string | null
  liquidacion_id: number | null
}

export interface TarifaCantera {
  id: number
  cantera_id: number
  valor_ton: number
  obs: string | null
  updated_at: string | null
  updated_by: string | null
  canteras?: { nombre: string; localidad: string | null }
}

export type EmpresaEstado = 'activa' | 'inactiva'

// 'liquido_producto': la empresa emite la liquidación y marcamos qué remitos
// pagó. 'facturacion': CADINC emite una factura por cada viaje.
export type EmpresaModalidadCobro = 'liquido_producto' | 'facturacion'

export interface EmpresaTransportista extends AuditFields {
  id: number
  nombre: string
  cuit: string | null
  tel: string | null
  email: string | null
  obs: string | null
  estado: EmpresaEstado
  modalidad_cobro: EmpresaModalidadCobro
  // Es intermediaria: nos emite una contra factura por su comisión sobre cada
  // factura nuestra. Sus viajes no se liquidan a choferes pct hasta cargarla.
  contra_factura: boolean
}

export interface TarifaEmpresaCantera {
  id: number
  empresa_id: number
  cantera_id: number
  deposito_id: number | null   // null = tarifa general; set = específica para descargas en ese depósito
  tipo_unidad: 'batea' | 'chasis' | null  // null = cualquier unidad; set = según el camión del viaje
  variante: string | null      // null = tarifa única/base; set = variante para la misma ruta ("Tarifa 2", cliente final)
  valor_ton: number
  vigente_desde: string
  obs: string | null
  updated_at: string | null
  updated_by: string | null
  empresas_transportistas?: { nombre: string }
  canteras?: { nombre: string; localidad: string | null }
  depositos?: { nombre: string; localidad: string | null } | null
}

export type CobroEstado = 'pendiente' | 'cobrado'

export interface Cobro {
  id: number
  empresa_id: number
  fecha_desde: string
  fecha_hasta: string
  toneladas_totales: number
  total: number
  estado: CobroEstado
  obs: string | null
  // Fecha real del cobro (la carga el usuario al confirmar pago; 20260806).
  cobrado_en?: string | null
  // Factura emitida por CADINC — solo en cobros de empresas con
  // modalidad_cobro='facturacion' (una factura por viaje).
  factura_nro: string | null
  factura_fecha: string | null
  // Contra factura que la empresa intermediaria emitió por su comisión sobre
  // esta factura. El importe vive por viaje en `Tramo.comision_intermediario`.
  contra_factura_nro: string | null
  contra_factura_fecha: string | null
  created_at: string
  updated_at?: string | null
  empresas_transportistas?: { nombre: string; modalidad_cobro?: EmpresaModalidadCobro; contra_factura?: boolean }
  // Adjuntos del cobro (embebidos por el backend) — para mostrar qué
  // documentos tiene sin una query por fila, y agrupar en el historial las
  // facturas pagadas con el mismo comprobante (mismo hash = mismo pago).
  cobros_adjuntos?: { tipo: CobroAdjuntoTipo; deleted_at: string | null; hash_sha256?: string | null }[]
}

export type Accion = 'lectura' | 'creacion' | 'actualizacion' | 'eliminacion'
export type ModuloPermisos = { [K in Accion]?: boolean } & {
  tabs?: string[]
  // Capacidades específicas (v3: default false, true = "tiene acceso/ve más").
  // Admin las recibe true automáticamente vía bypass.
  //
  // - tarja.ver_costos: ve precios/totales/tarifas en tarja.
  // - tarja.ver_pii: ve datos sensibles del personal (DNI, dirección, etc.).
  // - tarja.administrar_obras: crear/editar/archivar/eliminar la entidad obra.
  //   Independiente de tarja.{creacion,actualizacion,eliminacion} que
  //   controlan operaciones sobre horas/asignaciones.
  // - certificaciones.resolver_items: comprar/despachar/enviar/rechazar items.
  // - certificaciones.forzar_despacho: forzar despacho sin stock disponible.
  // - certificaciones.aprobar_ajustes_stock: aprobar/rechazar ajustes
  //   manuales de stock pendientes (doble control para evitar tapado de
  //   faltantes). Independiente de actualizacion (que permite CREAR el
  //   ajuste pendiente).
  // - alquiler.gestionar_cobros: cargar/editar cobros de clientes sin ser
  //   admin (eliminar cobros sigue admin-only).
  // - tarja.costos_oficina: ve el tab "Costos oficina" del dashboard
  //   (estructura administrativa prorrateada por obra). Dato sensible:
  //   expone sueldos del personal administrativo. Opt-in explícito, no
  //   viene en ningún preset. Solo tiene efecto en tarja.
  // - tarja.asistente_ia: habilita el chat "Asistente IA" (consultas de solo
  //   lectura sobre datos del ERP vía Claude API). El asistente NO es un
  //   bypass de permisos: cada herramienta valida los permisos del usuario
  //   que pregunta y scopea por sus obras permitidas. Consume créditos de
  //   API. Opt-in explícito, no viene en ningún preset. Solo tiene efecto
  //   en tarja (admin bypass como el resto de las flags).
  //
  // Flags eliminadas en Permisos v3 (2026-05-18):
  // - vista_completa: reemplazada por `obras_scope` global del profile.
  // - solo_carga_horas: cubierta por tabs=['tarja'] + obras_scope='asignadas'.
  ver_costos?:             boolean
  ver_pii?:                boolean
  resolver_items?:         boolean
  /** Editar SOLO los pedidos propios, y solo los renglones pendientes. */
  editar_pedidos?:         boolean
  marcar_consumibles?:  boolean   // 20260917n: marcar consumibles propios sin cargar_precios
  forzar_despacho?:        boolean
  /** Editar precio y "quién lo pagó" de renglones resueltos: mueve la cuenta del cliente. Solo admin por default. */
  cargar_precios?:         boolean
  /** Tipear el precio al comprar/despachar. Default true; se apaga a propósito. */
  precio_al_resolver?:     boolean
  administrar_obras?:      boolean
  aprobar_ajustes_stock?:  boolean
  gestionar_cobros?:       boolean
  // - alquiler.gestionar_docs: gestionar documentación de máquinas (póliza de
  //   seguro, aseguradora, vencimiento) sin ser admin. En updateMaquina el
  //   backend limita al no-admin con este flag a los campos de seguro; el
  //   resto del ABM de flota sigue admin-only. Solo tiene efecto en alquiler.
  gestionar_docs?:         boolean
  // - alquiler.gestionar_abm: dar de alta y editar máquinas, clientes, obras y
  //   asignaciones sin ser admin. Borrar sigue admin-only.
  gestionar_abm?:          boolean
  // - logistica.anular_cobros: eliminar cobros PENDIENTES de facturación sin
  //   eliminación del módulo entero. Los ya cobrados siguen bloqueados por el
  //   service (COBRO_YA_COBRADO). Solo tiene efecto en logística.
  anular_cobros?:          boolean
  costos_oficina?:         boolean
  asistente_ia?:           boolean
  // - pagos.aprobar_facturas: aprobar/rechazar facturas de proveedor y revisar
  //   las "pagadas al cargar". Nadie aprueba las propias salvo admin.
  // - pagos.registrar_pagos: emitir órdenes de pago sobre facturas aprobadas,
  //   observar y cargar los datos de pago del proveedor (con ver_pii).
  // - pagos.anular_pagos: anular una OP ajena o de otro día (con
  //   registrar_pagos solo se anula la propia del día).
  registrar_pagos?:        boolean
  aprobar_facturas?:       boolean
  aprobar_propias?:     boolean   // 20260921f: aprobar lo propio, y que nazca aprobado
  anular_pagos?:           boolean
  // - facturacion.emitir_facturas: mandar a ARCA un borrador de factura y
  //   verificar en ARCA una emisión incierta (/reconciliar).
  // - facturacion.emitir_notas_credito: emitir NC (separado a propósito:
  //   anular una factura es otra decisión).
  // - facturacion.registrar_finnegans: registrar/deshacer el número de
  //   Finnegans de una factura autorizada. Los tres default false (20260924b).
  emitir_facturas?:        boolean
  emitir_notas_credito?:   boolean
  registrar_finnegans?:    boolean
  // - facturacion.registrar_cobros: registrar cobros (recibos), imputar a
  //   cuenta y compensar NC. `anular_cobros` (de arriba) en facturación anula
  //   cobros e imputaciones. Los dos default false (20260924o).
  registrar_cobros?:       boolean
  // Contabilidad (20260926), todos default false: cargar/confirmar/anular
  // asientos manuales, cerrar y reabrir períodos, editar el plan de cuentas.
  asientos_manuales?:      boolean
  cerrar_periodos?:        boolean
  editar_plan?:            boolean
  // Contabilidad fase 3 (20260927): generar asientos automáticos y editar
  // los mapeos (qué cuenta usa cada concepto). Default false.
  contabilizar?:           boolean
  editar_mapeos?:          boolean
  // Contabilidad tanda 5 (20260928): movimientos de fondos sin factura y
  // bienes de uso (ABM, importar y amortizar). Default false.
  movimientos_fondos?:     boolean
  bienes_uso?:             boolean
  // - pagos.importar_comprobantes: alta masiva de facturas recibidas desde
  //   «Mis Comprobantes» de ARCA (quedan sin imputar). Default false.
  importar_comprobantes?:  boolean
  // Tanda 6 (20260929a): configurar Ventas / Compras y, en admin, los Datos
  // de la empresa. Default false; admin bypass.
  configurar?:             boolean
  // Sueldos (20261004), default false: liquidar (crear liquidaciones y
  // recibos) y cerrar/reabrir/anular/contabilizar liquidaciones.
  liquidar?:               boolean
  cerrar_liquidaciones?:   boolean
}
export type Permisos = Record<string, ModuloPermisos>

// ── Roles (tabla `roles`, editable desde Admin → Plantillas de roles) ──
// `rol_base` es la identidad que usa el backend (capataz / jefe_obra scopean
// por obra); `key` es el slug del rol. Helpers en `src/lib/permisos/plantillas.ts`.
export type RolBase = 'administrativo' | 'compras' | 'deposito' | 'jefe_obra' | 'capataz'
export type ObrasScope = 'todas' | 'asignadas'

export interface Rol {
  key:                 string          // slug [a-z0-9_]+
  label:               string
  descripcion:         string
  permisos:            Permisos        // mismo shape que profiles.permisos
  obras_scope_default: ObrasScope
  rol_base:            RolBase | null
  orden:               number
  activo:              boolean
  usuarios:            number          // perfiles con rol_key = key
  personalizados:      number          // de esos, cuántos tienen ajustes propios
}

export interface Profile {
  id:       string
  nombre:   string
  rol:      'admin' | 'operador'
  // Lo deriva el backend de `permisos` (módulos con lectura). Solo lectura:
  // el cliente ya no lo manda en POST/PATCH /api/usuarios.
  modulos:  string[]
  activo:   boolean
  permisos: Permisos
  rol_base?:    RolBase | null
  obras_scope?: ObrasScope
  // Rol del que parte el usuario (tabla `roles`). null = admin o personalizado puro.
  rol_key?:      string | null
  // true = tiene ajustes propios sobre el rol; "Aplicar rol" no lo pisa.
  personalizado?: boolean
  /**
   * @deprecated Legacy, solo lectura por compat. El backend lo ignora en
   * POST/PATCH y ningún componente lo escribe ni lo muestra.
   */
  tipo_usuario?: string | null
}

export interface Modulo {
  id:          number
  key:         string
  nombre:      string
  descripcion: string | null
  icono:       string | null
  activo:      boolean
  orden:       number
}

export interface HerrTipo {
  id:     number
  nom:    string
  icono:  string | null
  activo: boolean
  orden:  number
}

export interface HerrEstado {
  key:    string
  nom:    string
  color:  string
  icono:  string | null
  activo: boolean
  orden:  number
}

export interface HerrModelo {
  id:       number
  marca_id: number
  nom:      string
  activo:   boolean
}

export interface HerrMarca {
  id:       number
  nom:      string
  activo:   boolean
  orden:    number
  modelos:  HerrModelo[]
}

export interface HerrMovTipo {
  key:         string
  nom:         string
  icono:       string | null
  color:       string
  descripcion: string | null
  activo:      boolean
  orden:       number
}

export interface Herramienta {
  id:            number
  codigo:        string
  nom:           string
  tipo_id:       number | null
  tipo:          HerrTipo | null
  marca:         string | null
  marca_id:      number | null
  marca_ref:     { id: number; nom: string } | null
  modelo:        string | null
  modelo_id:     number | null
  modelo_ref:    { id: number; nom: string } | null
  serie:         string | null
  fecha_ingreso: string | null
  estado_key:    string
  estado:        HerrEstado | null
  obra_cod:      string | null
  obra:          { cod: string; nom: string; es_deposito?: boolean } | null
  responsable:   string | null
  obs:           string | null
  activo:        boolean
  created_at:    string
  updated_at:    string
  created_by?:   string | null
  updated_by?:   string | null
}

export interface HerramientaFoto {
  id:             number
  herramienta_id: number
  storage_path:   string
  file_hash:      string | null
  descripcion:    string | null
  orden:          number
  created_at:     string
  created_by:     string | null
}

export interface HerrMovimiento {
  id:               number
  herramienta_id:   number
  herramienta:      { id: number; codigo: string; nom: string } | null
  tipo_key:         string
  tipo:             HerrMovTipo | null
  obra_origen_cod:  string | null
  obra_origen:      { cod: string; nom: string } | null
  obra_destino_cod: string | null
  obra_destino:     { cod: string; nom: string } | null
  responsable:      string | null
  obs:              string | null
  fecha:            string
  created_at:       string
}

export interface HerrConfig {
  tipos:    HerrTipo[]
  estados:  HerrEstado[]
  movTipos: HerrMovTipo[]
}

export interface HerrStats {
  total:              number
  disponibles:        number
  enUso:              number
  enRep:              number
  bajas:              number
  enObras:            number
  ultimosMovimientos: HerrMovimiento[]
}

// ── Salidas de herramientas a obra (bandeja del pañol) ──
// Las escribe el trigger `trg_herr_entregas_sync` sobre el delta de
// `solicitud_compra_item.cantidad_enviada` (migración 20260904b). Fase 1 NO
// toca el padrón de herramientas: es un log de texto de lo que se llevó.
export type HerrEntregaEstado =
  | 'pendiente' | 'confirmada' | 'vinculada' | 'catalogada' | 'ignorada' | 'anulada' | 'revisar'

/** Qué pasó con una herramienta que sale de «en obra» (20261005d). */
export type HerrCierre = 'volvio' | 'perdida' | 'rota' | 'baja_en_obra'

export interface HerrEntrega {
  id:               number
  item_id:          number | null
  solicitud_id:     number | null
  obra_cod:         string | null
  descripcion:      string
  descripcion_norm: string
  cantidad:         number
  unidad:           string | null
  material_id:      number | null
  fecha:            string
  sentido:          'salida' | 'devolucion'
  // 'clase' = tildado a mano · 'catalogo' = el material está marcado como
  // herramienta · 'patron' = detectado por el texto de la descripción.
  origen:           'clase' | 'catalogo' | 'patron' | 'manual'
  es_backfill:      boolean
  estado:           HerrEntregaEstado
  herramienta_id:   number | null
  movimiento_id:    number | null
  remito_envio_id:  number | null
  remito_numero:    string | null
  nota:             string | null
  resuelto_por:     string | null
  resuelto_el:      string | null
  /** Devolución manual (20260904ay): la salida que devuelve. */
  salida_id:        number | null
  /** Solo en devoluciones (20261005d): null o 'volvio' = volvió al pañol; el resto no vuelve. */
  cierre?:          HerrCierre | null
  /** En una salida: Σ de sus devoluciones vivas; `en_obra` = cantidad − devuelto. */
  devuelto:         number
  en_obra:          number
  created_at:       string
  updated_at:       string
}

export interface HerrEntregasPage {
  items:  HerrEntrega[]
  total:  number
  limit:  number
  offset: number
}

/** Tipo de herramienta del catálogo (stock_materiales clase 'herramienta') + resumen del pañol (v_herr_tipos). */
export interface HerrTipoCatalogo {
  id:           number
  nombre:       string
  alias:        string[] | null
  obs:          string | null
  activo:       boolean
  rubro_id:     number | null
  created_at:   string
  updated_at:   string
  /** Σ en_obra de las salidas confirmadas (lo que sigue afuera). */
  en_obra:      number
  n_obras:      number
  sin_revisar:  number
  salidas:      number
  devoluciones: number
  ultima:       string | null
  /** Renglones de pedido que usaron el tipo. */
  renglones:    number
}

export interface HerrEntregasObraResumen {
  cod:            string
  n:              number
  n_pendientes:   number
  /** Salidas vivas con algo todavía en obra. */
  n_en_obra:      number
  cant_en_obra:   number
  n_devoluciones: number
  ultima:         string | null
}

export interface HerrEntregasStats {
  pendientes:   number
  revisar:      number
  obras:        number
  en_obra:      number
  devoluciones: number
  // Herramientas que salieron y NO quedaron registradas. Tiene que ser 0
  // siempre: si no, el `exception when others` del trigger tapó un error.
  faltantes:  number
  /** Obras con salidas, con su conteo. Viene del backend y no del listado
   *  paginado: si se derivara de la página actual, el filtro no ofrecería las
   *  obras que quedaron en las páginas siguientes. */
  obras_lista: HerrEntregasObraResumen[]
}

// ── Ropa de trabajo ──
export interface RopaCategoria {
  id:                 number
  nombre:             string
  icono:              string | null
  activo:             boolean
  meses_vencimiento:  number
  /** De qué talle de la ficha del trabajador sale la precarga (20260923o). */
  talle_de?:          'pantalon' | 'botines' | 'camisa' | null
}

export interface RopaEntrega {
  id:            number
  leg:           string
  categoria_id:  number
  fecha_entrega: string
  obs:           string | null
  /** Unidades entregadas (20260923o; las viejas quedaron en 1). */
  cantidad?:     number
  /** Talle entregado (20260923o; '' = no se anotó). */
  talle?:        string
  created_by:    string | null
  created_at:    string
}

// ── Horas extras (por semana) ──
export interface TarjaHsExtra extends AuditFields {
  id:        number
  obra_cod:  string
  leg:       string
  sem_key:   string   // YYYY-MM-DD (viernes)
  hs:        number
}

export interface UpsertHsExtraDto {
  obra_cod: string
  leg:      string
  sem_key:  string
  hs:       number
}

export interface UpsertHsExtrasLoteDto {
  obra_cod: string
  items:    Array<{ leg: string; sem_key: string; hs: number }>
}

// ── Préstamos ──
// 'incobrable' (2026-08-20): baja de saldo por renuncia u otra causa. Salda
// como un descuento pero NO cuenta como plata recuperada ni descuento de
// semana — los cierres y exports que filtran tipo='descontado' lo excluyen.
export interface Prestamo {
  id:         number
  leg:        string
  sem_key:    string
  tipo:       'otorgado' | 'descontado' | 'incobrable'
  monto:      number
  concepto:   string | null
  created_by: string | null
  created_at: string
}

// ── Proveedores ──
export interface Proveedor extends AuditFields {
  id:     number
  nombre: string
  cuit:   string | null
  tel:    string | null
  email:  string | null
  obs:    string | null
  activo: boolean
}

// ── Facturas de compra ──
export interface FacturaCompra extends AuditFields {
  id:             number
  proveedor_id:   number
  numero:         string | null
  fecha:          string
  adjunto_url:    string | null
  adjunto_nombre: string | null
  total:          number | null
  obs:            string | null
  proveedores?:   { nombre: string }
}

// ── Solicitudes de compra ──
export type SolicitudEstado = 'pendiente' | 'aprobada' | 'rechazada'
export type ItemClase = 'material' | 'herramienta' | 'servicio'

export type ItemEstado =
  | 'pendiente'
  | 'comprado'
  | 'de_deposito'
  | 'en_proveedor'   // comprado pero queda en el galpón del proveedor
  | 'retirado'       // ya se retiró del proveedor (terminal o paso previo a 'enviado')
  | 'de_stock_cliente' // cubierto con material del cliente administrado en depósito (sin MCC)
  | 'enviado'
  | 'rechazado'
export type SolicitudProgreso = 'pendiente' | 'en_gestion' | 'enviada'

/**
 * Quién pagó al proveedor en una compra:
 * - 'cadinc':  CADINC adelantó. Se suma a la cuenta del cliente (deuda).
 * - 'cliente': el cliente pagó directo al proveedor. Solo registro de rendición.
 *
 * Despacho de depósito interno siempre es 'cadinc' (material propio).
 */
export type PagadoPor = 'cadinc' | 'cliente'

export interface SolicitudCompraItem {
  id?:              number
  solicitud_id?:    number
  descripcion:      string
  cantidad:         number
  /** Cantidad realmente comprada si difiere de la solicitada. `null` = se compró lo solicitado. */
  cantidad_comprada?: number | null
  /** Acumulado enviado (envíos parciales 2026-07-22). El item pasa a 'enviado'
   *  recién cuando cubre la cantidad efectiva; mientras, sigue "por enviar". */
  cantidad_enviada?: number
  /**
   * El remito con el que salió, si ya se emitió.
   *
   * NO es lo mismo que `cantidad_enviada > 0`: hay 19 renglones con remito y
   * cantidad_enviada en 0 (del envío que se deshizo) y 57 al revés. Para saber
   * si el papel ya existe hay que mirar ESTE campo, no el acumulado.
   */
  remito_envio_id?: number | null
  unidad:           string
  obs?:             string | null
  /**
   * Color pedido para la obra ("gris", "verde tenis", "blanco mate").
   * Texto libre a propósito: la carta de colores es del proveedor y cambia.
   * El form solo lo pide si el material tiene `usa_color` — ver migración
   * 20260902s y `StockMaterial.usa_color`.
   */
  color?:           string | null
  /**
   * `material` (default) o `herramienta`. La derivación al pañol es un FILTRO
   * sobre esto, no una copia de la fila: la línea nunca sale de esta tabla.
   * Solo lo setea un humano con el toggle — no hay backfill heurístico.
   */
  clase?:           ItemClase
  /**
   * Campo CALCULADO por PostgREST (migración 20260904f): el renglón es
   * herramienta según `es_herramienta_item()` — el tilde manual, o el material
   * del catálogo, o el texto de la descripción. Es de solo lectura y es la
   * única fuente: no reimplementar la regla en el cliente.
   * `clase` cubre 4 de 256 casos reales; esto cubre los 256.
   */
  es_herramienta?:  boolean
  /**
   * Solo con `clase='herramienta'`: la obra DEVUELVE la herramienta en vez de
   * pedirla. Es el disparador de la devolución, que antes no existía.
   */
  devuelve?:        boolean
  estado:           ItemEstado
  material_id?:     number | null
  proveedor_id?:    number | null
  precio_unit?:     number | null
  factura_id?:      number | null
  fecha_resolucion?: string | null
  fecha_envio?:     string | null
  /** Quién pagó esta compra. Default `'cadinc'` en datos históricos. */
  pagado_por?:      PagadoPor
  /**
   * Compra registrada sin precio porque el proveedor lo pasa después
   * (20260912c). Se apaga sola cuando se carga el precio.
   */
  esperando_precio?: boolean
  proveedores?:     { nombre: string } | null
  facturas_compra?: { numero: string | null; adjunto_url: string | null } | null
}

/**
 * Evento de transición de estado de un ítem de solicitud (timeline de
 * trazabilidad). Tabla `solicitud_item_eventos`, append-only.
 * `user_id` referencia auth.users — el nombre se resuelve en el front con
 * usePerfilesMap (no hay FK a profiles para embeber en el backend).
 * `accion` es texto libre (sin enum en DB): ver ACCION_CFG en ItemHistorialModal.
 */
export interface ItemEvento {
  id:              number
  item_id:         number
  solicitud_id:    number | null
  accion:          string
  estado_anterior: string | null
  estado_nuevo:    string
  cantidad:        number | null
  comentario:      string | null
  meta:            Record<string, unknown> | null
  user_id:         string | null
  created_at:      string
}

export interface SolicitudCompra extends AuditFields {
  id:           number
  obra_cod:     string
  // Nombre de la obra resuelto en el backend (embed obra_cod→obras.cod). Puede
  // ser null si la obra fue borrada; el consumidor cae a obra_cod.
  obra_nom:     string | null
  solicitante:  string | null
  fecha:        string
  estado:       SolicitudEstado
  prioridad:    'normal' | 'urgente'
  obs:          string | null
  entrega_tentativa: string | null
  aprobado_por: string | null
  items:        SolicitudCompraItem[]
  progreso:     SolicitudProgreso | null
  resumen:      { total: number; resueltos: number; enviados: number } | null
}

// ── Materiales a cuenta de cliente ──
export interface MaterialACuentaCliente extends AuditFields {
  id:               number
  obra_cod:         string
  solicitud_id:     number
  item_id:          number
  descripcion:      string
  cantidad:         number
  unidad:           string
  precio_unit:      number
  precio_total:     number
  origen:           'proveedor' | 'deposito'
  proveedor_id:     number | null
  factura_id:       number | null
  fecha_resolucion: string
  /**
   * A quién se le imputa (20260904ak): 'cliente' → Cuenta del cliente;
   * 'cadinc' → gasto de CADINC (obra llave en mano o material EPP). Lo pone
   * la base, no se edita.
   */
  a_cargo_de:       MaterialesACargoDe
  /**
   * Quién pagó al proveedor. Si `'cadinc'` → suma a la cuenta del cliente
   * (deuda). Si `'cliente'` → solo se registra para rendición (no deuda).
   * Heredado de `solicitud_compra_item.pagado_por` al insertar el MCC.
   */
  pagado_por:       PagadoPor
  /**
   * Imputación de pagos (2026-07-21): id del cobro que pagó este item
   * (null = adeudado) y el monto congelado al momento de imputar — si el
   * item se retasa después, la rendición histórica no cambia.
   */
  cobro_id:         number | null
  monto_cobrado:    number | null
}

export type MedioCobro = 'efectivo' | 'transferencia' | 'cheque' | 'otro'

/** Pago del cliente a cuenta de una obra (contra materiales_a_cuenta_cliente). */
export interface CuentaClienteCobro extends AuditFields {
  id:       number
  obra_cod: string
  fecha:    string
  monto:    number
  medio:    MedioCobro
  obs:      string | null
  /** Path del comprobante en el bucket privado cobros-docs (se firma on-demand). */
  comprobante_url:  string | null
  /** Cobro contra un certificado (20260911j): reparto entre materiales y mano de obra. */
  certificado_id:     number | null
  monto_mano_de_obra: number
  monto_materiales:   number
}

// ── Certificado al cliente (20260911h) ──
// La "presentacion" de la cuenta corriente: corte por fecha, mano de obra por
// avance y los renglones de materiales hasta el corte, congelados al emitir.
export interface CertificadoCliente extends AuditFields {
  id:               number
  obra_cod:         string
  numero:           number
  fecha_corte:      string
  fecha_emision:    string
  estado:           'emitido' | 'anulado'
  mano_de_obra:     number
  total_materiales: number
  total:            number
  renglones:        number
  obs:              string | null
  emitido_por:      string | null
  anulado_por:      string | null
  anulado_el:       string | null
  anulado_motivo:   string | null
}
export interface CertificadoDetalle extends CertificadoCliente {
  renglones_lista: CuentaRenglon[]
  cobros:          CuentaClienteCobro[]
  cobrado:         number
  saldo:           number
}
/** Lo que devuelve emitir: el certificado mas lo que quedo afuera. */
export interface CertificadoEmitido {
  id: number; numero: number; obra_cod: string; fecha_corte: string
  mano_de_obra: number; total_materiales: number; total: number
  renglones: number; retasados: number; sin_precio_excluidos: number
}

// ── Cuenta corriente (20260904ap) ──
// Una sola vista para lo que se le cobra al cliente y lo que gastó CADINC.
// Cada renglón de la cuenta tiene UN estado excluyente (lo deriva la vista
// v_cuenta_corriente, en este orden): pago_directo (el cliente le pagó al
// proveedor), gasto_cadinc (llave en mano o EPP), cobrado, a_cobrar.

export type CuentaEstado = 'a_cobrar' | 'cobrado' | 'pago_directo' | 'gasto_cadinc'
/** 'consumible' desde 20260914aa: lo pone CADINC para ejecutar y no se cobra. */
export type CuentaTipo   = 'material' | 'epp' | 'consumible'
export type MotivoCadinc = 'llave_en_mano' | 'epp' | 'consumible' | 'obra_interna'
export type CuentaGrupo  = 'obra' | 'mes' | 'proveedor'

export interface CuentaRenglon {
  id:                  number
  /** Certificado que lo congelo (20260911j), si ya se presento. */
  certificado_id?:     number | null
  certificado_numero?: number | null
  /** Compra sin precio, el proveedor lo pasa después (20260912c). */
  esperando_precio?:   boolean
  /** Precio de referencia de la ficha del renglón (20260912f), para "usar sugeridos". Null sin ficha. */
  ficha_precio_ref?:   number | null
  ficha_unidad?:       string | null
  /** La unidad del renglón es compatible con la de la ficha (`unidad_compatible`). Null sin ficha. */
  ficha_unidad_ok?:    boolean | null
  obra_cod:            string
  obra_nom:            string
  obra_archivada:      boolean
  obra_modalidad:      MaterialesACargoDe
  solicitud_id:        number
  item_id:             number
  descripcion:         string
  cantidad:            number
  unidad:              string
  precio_unit:         number
  precio_total:        number
  origen:              'proveedor' | 'deposito'
  proveedor_id:        number | null
  proveedor_nom:       string | null
  factura_id:          number | null
  factura_numero:      string | null
  factura_adjunto_url: string | null
  factura_fecha:       string | null
  fecha_resolucion:    string
  /** YYYY-MM de fecha_resolucion. */
  mes:                 string
  pagado_por:          PagadoPor
  a_cargo_de:          MaterialesACargoDe
  cobro_id:            number | null
  monto_cobrado:       number | null
  /** Estado del ítem de la solicitud (imputable a un pago solo si es final). */
  item_estado:         string
  material_id:         number | null
  clase:               ClaseMaterial | null
  rubro_id:            number | null
  rubro_nom:           string | null
  tipo:                CuentaTipo
  estado:              CuentaEstado
  /** Por qué es gasto de CADINC (solo si a_cargo_de = 'cadinc'). */
  motivo_cadinc:       MotivoCadinc | null
  /** Marcado a mano como consumible propio de CADINC (20260914aa). */
  consumible_propio:   boolean
  /** Texto corto del estilo "discos de corte". Null si se marcó sin motivo. */
  consumible_motivo:   string | null
  created_at:          string
  updated_at:          string
}

export interface CuentaRenglonesPage {
  items:  CuentaRenglon[]
  total:  number
  limit:  number
  offset: number
}

/** Una fila por grupo × estado × tipo del conjunto filtrado. */
export interface CuentaResumenGrupo {
  grupo:      string
  grupo_nom:  string
  /** Modalidad de la obra (solo cuando el grupo es 'obra'). */
  modalidad:  MaterialesACargoDe | null
  estado:     CuentaEstado
  tipo:       CuentaTipo
  renglones:  number
  total:      number
  sin_precio: number
  ultimo:     string | null
}

export interface CuentaResumenPagos {
  obra_cod: string
  pagos:    number
  monto:    number
}

/**
 * Notas de crédito por obra (20260913l): saldo a favor del cliente por material
 * devuelto cuyo renglón ya estaba cobrado o certificado.
 *
 * Viven en su propio array y NO dentro de `pagos` a propósito. Una nota no es
 * plata que entró, es deuda que baja: si se mezclaran, una devolución
 * aparecería en pantalla como cobranza.
 */
export interface CuentaResumenNotas {
  obra_cod: string
  notas:    number
  monto:    number
}

export interface CuentaResumen {
  grupos: CuentaResumenGrupo[]
  pagos:  CuentaResumenPagos[]
  /** Puede faltar si el backend todavía no se deployó: tratarlo como []. */
  notas?: CuentaResumenNotas[]
}

/**
 * Herramientas compradas por un centro interno, agrupadas por mes.
 *
 * Vienen aparte del resto del gasto porque `materiales_a_cuenta_cliente` las
 * excluye a propósito (una herramienta va y vuelve, no se le factura a nadie).
 * En la pantalla van en su propia columna, etiquetadas como patrimonio: no se
 * suman al consumo del mes.
 */
export interface GastoInternoHerramientas {
  mes:       string
  obra_cod:  string
  obra_nom:  string
  renglones: number
  total:     number
}

export interface GastoInterno extends CuentaResumen {
  herramientas: GastoInternoHerramientas[]
}

/**
 * Una versión de los porcentajes de una obra por administración. `desde` es
 * siempre viernes; la vigente para una semana o fecha es la de mayor `desde`
 * que no la pase. Se agregan versiones, nunca se pisan.
 */
export interface AdminTarifa {
  id:               number
  obra_cod:         string
  desde:            string
  pct_operarios:    number
  pct_contratistas: number
  pct_materiales:   number
  created_at:       string
  created_by:       string | null
}

// ── Stock en Depósito ──
export interface StockRubro {
  id:     number
  nombre: string
  icono:  string | null
  orden:  number
  activo: boolean
}

export type MaterialesACargoDe = 'cliente' | 'cadinc'

/**
 * Clase de un material del catálogo.
 * - 'epp' (20260904ak): costo de CADINC, nunca se cobra al cliente.
 * - 'servicio' (20260915j): fletes, envíos, volquetes, cortes y plegados de
 *   taller. Entra por el pedido como cualquier renglón y cae en la cuenta de la
 *   obra respetando a_cargo_de, pero NO tiene stock: una guarda en
 *   stock_movimientos lo saca del despacho de depósito y de las devoluciones.
 */
export type ClaseMaterial = 'material' | 'herramienta' | 'epp' | 'servicio'


/**
 * Fila del catálogo de precios (`v_catalogo_materiales`, migración 20260904v):
 * el material con su rubro, el precio de referencia y de cuándo es, y la
 * última compra real (no despachos de depósito). `uc_*` viene null si el
 * material nunca se compró por el sistema.
 */
/** Una compra real de un material (v_material_compras, 20260906f). */
export interface MaterialCompra {
  material_id:      number
  item_id:          number
  solicitud_id:     number
  obra_cod:         string
  obra_nom:         string | null
  descripcion:      string
  color:            string | null
  cantidad:         number
  unidad:           string
  precio_unit:      number
  proveedor_id:     number | null
  proveedor_nombre: string | null
  fecha:            string | null
  pagado_por:       string
  factura_id:       number | null
  factura_numero:   string | null
  estado:           string
  /**
   * Descartada como referencia de precio (20260912a): sigue en el historial y
   * en la cuenta de la obra, pero el catálogo no la mira para decidir si el
   * material está desactualizado.
   */
  precio_no_referencia?: boolean
}
export interface MaterialCompraProveedor {
  proveedor_id:  number | null
  proveedor:     string
  ultimo_precio: number
  ultima_fecha:  string | null
  compras:       number
  minimo:        number
  maximo:        number
}
export interface MaterialComprasResumen { compras: MaterialCompra[]; por_proveedor: MaterialCompraProveedor[] }

export interface CatalogoMaterial {
  id:                    number
  rubro_id:              number
  rubro:                 string
  rubro_icono:           string | null
  nombre:                string
  unidad:                string
  precio_ref:            number
  /** Cuándo cambió por última vez `precio_ref` (trigger). Null si nunca tuvo precio. */
  precio_actualizado_en: string | null
  proveedor_id:          number | null
  proveedor_nombre:      string | null
  alias:                 string[]
  clase:                 ClaseMaterial
  activo:                boolean
  usa_color:             boolean
  stock_actual:          number
  obs:                   string | null
  updated_at:            string | null
  uc_precio:             number | null
  uc_proveedor:          string | null
  uc_fecha:              string | null
  uc_pedido:             number | null
  uc_obra:               string | null
  /** Foto principal de la ficha (20260912g). */
  foto_url?:             string | null
  /** Código interno de CADINC, `C-0128` (20260915n/o). Generado en la base desde el id. */
  codigo?:               string | null
  /** Unidad en que se cargó la última compra (20260911d). */
  uc_unidad?:            string | null
  /** La unidad de la última compra es compatible con la de la ficha (`unidad_compatible`). Null si no hay compra. */
  uc_unidad_ok?:         boolean | null
  /**
   * Qué hay que hacer con el precio (lo calcula la vista, 20260904z):
   * sin_precio (ni precio ni compra) · tasar (sin precio, con compra para
   * tomar) · unidad_distinta (la última compra está en otra unidad: no se
   * puede usar sin convertir, 20260911d) · desactualizado (difiere >0,5% de
   * la última compra) · al_dia · sin_compra (tiene precio, nunca se compró
   * por el sistema).
   */
  estado_precio:         CatalogoEstadoPrecio
  /** Última compra vs referencia, en % (null si falta alguno de los dos). */
  dif_pct:               number | null
}

export type CatalogoEstadoPrecio = 'sin_precio' | 'tasar' | 'unidad_distinta' | 'desactualizado' | 'al_dia' | 'sin_compra'

/**
 * Lo que se puede pedir como filtro: los estados que calcula la vista más los
 * agrupadores que arma el backend — `mas_caro` / `mas_barato` parten los
 * desactualizados por el signo de `dif_pct` (la última compra salió más cara
 * o más barata que el precio de referencia).
 */
export type CatalogoFiltroEstado = CatalogoEstadoPrecio | 'mas_caro' | 'mas_barato'

export interface CatalogoPage {
  items: CatalogoMaterial[]
  total: number
}

export interface CatalogoStats {
  total:           number
  sin_precio:      number
  tasar:           number
  desactualizado:  number
  al_dia:          number
  unidad_distinta: number
  /** Desactualizados donde la compra salió MÁS CARA que la referencia. */
  mas_caro:        number
  /** …y donde salió más barata. */
  mas_barato:      number
}

/**
 * Lo que el backend sugiere al comprar un renglón (GET
 * /api/solicitudes/items/:id/sugerencia-precio, 20260911): catálogo, última
 * compra y última compra a este proveedor, con unidad y compatibilidad.
 */
export interface SugerenciaPrecioLinea {
  precio_unit: number
  unidad:      string | null
  fecha:       string | null
  proveedor:   string | null
  /** La unidad de esa compra es compatible con la del renglón. */
  compatible:  boolean
}

export interface SugerenciaPrecio {
  unidad_renglon:   string | null
  ficha: {
    id:                    number
    nombre:                string
    unidad:                string
    precio_ref:            number
    precio_actualizado_en: string | null
    dias_desde_precio:     number | null
    /** Más de 45 días sin actualizar. */
    precio_viejo:          boolean
  } | null
  ultima_compra:    SugerenciaPrecioLinea | null
  a_este_proveedor: SugerenciaPrecioLinea | null
  /** La unidad del renglón es compatible con la de la ficha. */
  compatible:           boolean
  puede_actualizar_ref: boolean
  motivo:               'SIN_FICHA' | 'UNIDAD_DISTINTA' | null
}

export interface StockMaterial extends AuditFields {
  id:            number
  /**
   * Código interno de CADINC, `C-0128`. Columna generada desde el id
   * (20260915n/o): se anota en el producto y se tipea en el pedido. Distinto
   * del código de lista del proveedor, que vive en `alias[1]` en 674 fichas.
   */
  codigo?:       string | null
  rubro_id:      number
  nombre:        string
  unidad:        string
  stock_actual:  number
  stock_minimo:  number
  precio_ref:    number
  /** Cuándo cambió por última vez `precio_ref` (trigger, 20260904v). */
  precio_actualizado_en?: string | null
  proveedor_id:  number | null
  obs:           string | null
  activo:        boolean
  /**
   * Sinónimos / nombres de obra del material ("lija 150", "taco 8",
   * "antiparras"). El catálogo guarda el nombre técnico; la obra pide por
   * estos. Alimentan la búsqueda del Combobox, no se muestran.
   * `not null default '{}'` en DB — puede venir `[]`, nunca null.
   */
  alias:         string[]
  /**
   * El color es una elección real para este material (pinturas, pastina, cable
   * unipolar, cerámicos). Cuando es true el form del pedido muestra el campo
   * "Color".
   *
   * Por qué un flag y no una fila por color: el catálogo ya probó la grilla y
   * falló — hay 19 filas de "Esmalte sintético <color> x <tamaño>" y 17 nunca
   * se usaron, mientras el color se escribía en texto libre en los materiales
   * que sí se piden (Pastina x 5kg, Latex p/ cielorraso).
   */
  usa_color:     boolean
  /**
   * Espejo de `SolicitudCompraItem.clase`: sirve para PRE-TILDAR el toggle al
   * elegir del catálogo. No decide por sí solo — el 97,6% de los pedidos de
   * herramienta se escriben en texto libre, sin material_id.
   */
  clase:         ClaseMaterial
  /** URL pública de la foto principal de la ficha (20260912g). Null si no tiene. */
  foto_url?:     string | null
  stock_rubros?: { nombre: string; icono: string | null }
  proveedores?:  { id: number; nombre: string } | null
}

/** Una foto de una ficha del catálogo (bucket público catalogo-fotos, 20260912g). */
export interface StockMaterialFoto {
  id:           number
  material_id:  number
  storage_path: string
  url:          string
  file_hash:    string | null
  descripcion:  string | null
  orden:        number
  created_at:   string
  created_by:   string | null
}

export interface StockMovimiento {
  id:                number
  material_id:       number
  tipo:              'entrada' | 'salida' | 'ajuste'
  cantidad:          number
  motivo:            'compra' | 'despacho_obra' | 'devolucion' | 'ajuste_inventario' | 'consumo_interno'
  obra_cod:          string | null
  solicitud_item_id: number | null
  obs:               string | null
  fecha:             string
  created_at:        string
  created_by:        string | null
  stock_materiales?: { nombre: string; unidad: string }
}

// ── Audit Log ──
export interface AuditLogEntry {
  id:           number
  user_id:      string | null
  user_nombre:  string | null
  modulo:       string
  accion:       string
  entidad:      string
  entidad_id:   string | null
  detalle:      string | null
  ip:           string | null
  created_at:   string
}

// ── Remitos de envío ──
export interface RemitoEnvioItem {
  id:          number
  remito_id:   number
  item_id:     number | null
  descripcion: string
  cantidad:    number
  unidad:      string
  precio_unit: number | null
  origen:      string
  proveedor:   string | null
  // Lo calcula el trigger trg_remito_item_marca_herramienta con el mismo
  // predicado que el ledger del pañol (migración 20260904e). El remito impreso
  // lo usa para el 🔧 y la leyenda "debe volver al pañol".
  es_herramienta: boolean
}

export interface RemitoEnvio {
  id:           number
  numero:       string
  fecha:        string
  obra_cod:     string
  solicitud_id: number | null
  origen:       string
  obs:          string | null
  created_at:   string
  created_by:   string | null
  items:        RemitoEnvioItem[]
}


export interface CertAdicional extends AuditFields {
  id:             number
  obra_cod:       string
  fecha:          string
  descripcion:    string
  monto:          number
  adjunto_url:    string | null
  adjunto_nombre: string | null
  obs:            string | null
}

// ── Stock de cliente (material del cliente administrado en depósito) ──
// Ledger stock_cliente_items + stock_cliente_movimientos (migración 20260820).
// Espejo de stock-proveedor: material ajeno en el galpón de CADINC. Los
// consumos NO facturan (el material ya es del cliente).
export interface StockClienteRow {
  item_id:            number
  obra_cod:           string
  descripcion:        string
  unidad:             string
  obs:                string | null
  activo:             boolean
  cantidad_entregada: number
  cantidad_consumida: number
  saldo:              number
  ultima_entrega:     string | null
  ultimo_consumo:     string | null
}

export interface StockClienteMovimiento {
  id:                number
  item_id:           number
  tipo:              'entrada' | 'salida'
  motivo:            'entrega_cliente' | 'consumo_obra' | 'ajuste' | 'devolucion'
  cantidad:          number
  solicitud_item_id: number | null
  fecha:             string
  obs:               string | null
  created_at:        string
  created_by:        string | null
}

// ── Costos de oficina (estructura administrativa prorrateada) ──
// Personal administrativo con sueldo mensual versionado (historial por
// `desde`, espejo de categoria_tarifas) y asignación porcentual del costo
// a destinos: obra concreta, logística o "general" (se prorratea entre
// obras según su costo directo del mes). Endpoints en /api/oficina/*.
// Dato sensible: gate con permiso tarja.costos_oficina en backend y UI.

export interface OficinaSueldo {
  id:            number
  costo_mensual: number
  desde:         string   // YYYY-MM-DD (vigencia de esta versión)
}

export interface OficinaPersona {
  id:      number
  nombre:  string
  activo:  boolean
  sueldos: OficinaSueldo[]   // historial completo de versiones
}

export type OficinaDestino = 'obra' | 'logistica' | 'general'

export interface OficinaAsignacion {
  destino:    OficinaDestino
  obra_cod:   string | null   // solo cuando destino === 'obra'
  porcentaje: number          // 0-100; el snapshot completo suma 100
  monto?:     number          // presente en el resumen mensual
}

// Snapshot de asignaciones vigente desde una fecha. El GET de asignaciones
// devuelve los snapshots agrupados por `desde`, más reciente primero.
export interface OficinaAsignacionSnapshot {
  desde: string
  items: OficinaAsignacion[]
}

// Shape de GET /api/oficina/resumen?mes=YYYY-MM
export interface OficinaResumenPersona {
  id:             number
  nombre:         string
  activo:         boolean
  costo_mensual:  number
  snapshot_desde: string | null
  asignaciones:   OficinaAsignacion[]   // con `monto` resuelto
}

export interface OficinaResumenMes {
  mes:          string   // YYYY-MM
  personas:     OficinaResumenPersona[]
  porObra:      Array<{ obra_cod: string; monto: number }>
  logistica:    number
  general:      number
  totalOficina: number
}

// ── Resumen de cuenta corriente de todas las obras (17/09) ─────────────
// Una fila por obra de cliente: jornales, contratistas y materiales con su %,
// total, pagado y saldo. Lo calcula el backend (resumen-obras.ts); acá sólo
// el shape. El régimen decide qué entra al total: en presupuesto cerrado los
// jornales y contratistas son costo (`en_cuenta = false`), no deuda.

export type ResumenObraRegimen = 'administracion' | 'presupuesto_cerrado'

export interface ResumenObraPata {
  costo:      number
  facturable: number
  /** false en presupuesto cerrado: se muestra en gris y no suma al total. */
  en_cuenta:  boolean
  /** El % vigente hoy; null si la obra no tiene porcentajes cargados. */
  pct:        number | null
}

export interface ResumenObraFila {
  obra_cod:     string
  obra_nom:     string
  /**
   * Para agrupar: el cliente de la obra (su razón social). Sin cliente, la
   * obra es su propio grupo. Reemplaza a `obras.cc` desde el 2026-09-23.
   */
  cliente:      string
  cliente_id:   number | null
  archivada:    boolean
  regimen:      ResumenObraRegimen
  /** null si quien mira no puede ver costos de tarja (`parcial = true`). */
  jornales:     ResumenObraPata | null
  contratistas: ResumenObraPata | null
  materiales:   { costo: number; facturable: number; sin_precio: number; pct: number | null }
  total:        number
  pagado:       number
  notas:        number
  saldo:        number
  /** Por administración sin porcentajes: está calculando al 0%. */
  sin_pct:      boolean
  /** Sin jornales ni contratistas por permisos: el total no es el total. */
  parcial:      boolean
}

export interface ResumenObras {
  filas:       ResumenObraFila[]
  con_tarja:   boolean
  generado_en: string
}

// ══════════════════════════════════════════════════════════════════════
// Módulo Pagos — facturas de proveedor, aprobación y órdenes de pago
// ══════════════════════════════════════════════════════════════════════
// Espejo de `pagos.schema.ts` del backend y de las cuatro vistas
// (`v_pagos_facturas`, `v_pagos_ordenes`, `v_pagos_proveedores`,
// `v_pagos_proveedor_saldo`). Si el backend cambia una lista cerrada, cambia
// acá: el módulo NO comparte tipos con certificaciones ni con caja (padrón de
// proveedores propio, a propósito).
//
// Tres reglas que se leen en los tipos:
//   - Todos los importes son FINALES, con IVA incluido.
//   - `imputable = total − percepciones` es lo que se reparte entre obras.
//   - `saldo = total − pagado − acreditado(NC)`: una nota de crédito cancela
//     deuda sin que salga plata.
//   - Desde 20260925 la NC de proveedor es un COMPROBANTE (`clase =
//     'nota_credito'` en `pagos_facturas`), no una línea de la OP. Su `saldo`
//     es 0 (nunca es deuda) y sus importes se RESTAN en totales y KPIs.

export type PagosTipoComprobante = 'A' | 'B' | 'C' | 'recibo' | 'ticket' | 'otro'
/** Qué es la fila de `pagos_facturas` (20260925a). La NC solo admite A/B/C. */
export type PagosClaseComprobante = 'factura' | 'nota_credito'
/** Códigos ARCA de nota de crédito (3 A, 8 B, 13 C, 53 M, 203/208/213 FCE). */
export const PAGOS_CBTE_NC = [3, 8, 13, 53, 203, 208, 213] as const
export type PagosEstadoFactura   = 'pendiente' | 'observada' | 'aprobada' | 'pagada_parcial' | 'pagada' | 'anulada'
/** Forma PREVISTA de la factura: incluye `cta_cte` (quedó en cuenta corriente = deuda). */
export type PagosFormaPrevista =
  | 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'echeq' | 'debito_automatico' | 'cta_cte' | 'otro'
/** Forma REAL que elige quien paga. Sin `cta_cte` y sin `nota_credito` (esa la pone el backend). */
export type PagosFormaPagoOP =
  | 'efectivo' | 'transferencia' | 'cheque' | 'echeq' | 'tarjeta' | 'debito_automatico' | 'otro'
/** Lo que puede tener guardado una OP: las de entrada + `nota_credito` (OP sin plata). */
export type PagosFormaPagoOPGuardada = PagosFormaPagoOP | 'nota_credito'
export type PagosTipoLinea       = 'factura' | 'a_cuenta' | 'nota_credito'
export type PagosEstadoOrden     = 'emitida' | 'anulada'
export type PagosTipoAdjFactura  = 'factura' | 'remito' | 'orden_compra' | 'otro'
/** `recibo_proveedor` y `cheque` (foto del cheque físico) desde 20260925o–q. */
export type PagosTipoAdjOrden    = 'comprobante_pago' | 'nota_credito' | 'otro' | 'recibo_proveedor' | 'cheque'
export type PagosEntidadAdjunto  = 'facturas' | 'ordenes'

/**
 * Avisos que NO bloquean y vuelven en el body de algunas mutaciones
 * (`APROBACION_RETIRADA`, `FACTURA_POSIBLE_DUPLICADA`, `PROVEEDOR_PARECIDO`,
 * `COMPROBANTE_YA_USADO`, `NC_POSIBLE_DUPLICADA`). Se muestran en el toast.
 */
export interface PagosAviso {
  code: string
  [k: string]: unknown
}

/**
 * Concepto de compra (`pagos_conceptos`, 20260925i–m): UNO por factura
 * (combustible, materiales…). La `descripcion` libre sigue siendo el detalle.
 * Sin DELETE: se da de baja con `activo=false`.
 */
export interface PagosConcepto {
  id:     number
  nombre: string
  orden:  number | null
  activo: boolean
}

export interface CrearConceptoInput {
  nombre: string
  orden?: number | null
}
export interface EditarConceptoInput {
  nombre?: string
  orden?:  number | null
  activo?: boolean
}

/** Fila de `v_pagos_proveedores` (el padrón propio del módulo). */
export interface PagosProveedor {
  id:                 number
  /** «PRV-0001». Lo pone la base (default): no se manda ni se edita (409 `CODIGO_NO_EDITABLE`). */
  codigo:             string
  razon_social:       string
  razon_social_norm:  string
  cuit:               string | null
  /** Sin `ver_pii` llegan enmascarados (`***1234`): el front nunca decide qué tapar. */
  alias_cbu:          string | null
  cbu:                string | null
  cbu_ultimos4:       string | null
  banco:              string
  /** Sugiere el vencimiento al cargar; no toca facturas ya cargadas. En modo
   *  `dias` son los días desde la factura; en `cierre_mensual`, los días desde
   *  el cierre (20260921g). */
  plazo_pago_dias:    number
  vencimiento_modo:   'dias' | 'cierre_mensual' | 'fin_mes_siguiente'
  /** Día del mes en que cierra la cuenta. null = el último día. Sólo con `cierre_mensual`. */
  cierre_dia:         number | null
  /** Cómo se le paga normalmente: la forma con que nacen sus facturas (20260930a). null = transferencia. */
  forma_pago_habitual?: PagosFormaPrevista | null
  /** El 45 % del ICL de sus facturas es pago a cuenta de IVA (gasoil de camiones, Ley 23.966; 20261001a). */
  icl_computa_pago_a_cuenta?: boolean
  /** Concepto con que se imputa normalmente lo suyo (20260930p). null = sin preferencia.
   *  La carga a mano lo precarga; el importador de ARCA se lo pone a lo importado. */
  concepto_habitual_id?: number | null
  /** Obra (centro de costo) a la que se imputa lo suyo al 100 % (20260930p). Con concepto
   *  habitual, lo importado de ARCA nace imputado. null = sin preferencia. */
  obra_habitual_cod?:    string | null
  contacto:           string
  telefono:           string
  email:              string
  obs:                string
  activo:             boolean
  baja_motivo:        string | null
  baja_por:           string | null
  baja_at:            string | null
  baja_por_nombre:    string | null
  datos_pago_actualizados_at:         string | null
  datos_pago_actualizados_por:        string | null
  datos_pago_actualizados_por_nombre: string | null
  saldo:              number
  saldo_aprobado:     number
  a_cuenta_sin_aplicar: number
  ultimo_pago:        string | null
  /** Solo `clase='factura'`. */
  facturas:           number
  sin_datos_pago:     boolean
  /** Crédito de NC aprobadas sin aplicar (20260925). Opcional hasta el deploy. */
  nc_disponible?:     number
  /** saldo − a cuenta − NC disponible. */
  saldo_neto?:        number
  created_at:         string
  updated_at:         string
  created_by:         string | null
  updated_by:         string | null
  // ── Datos de ARCA (20260925o). Nada obligatorio: hay proveedores sin CUIT o del exterior. ──
  domicilio?:            string | null
  provincia?:            string | null
  /** Mismos ids que Ventas (`CONDICIONES_IVA` de `@/lib/utils/arca`). */
  condicion_iva_id?:     number | null
  tipo_persona?:         string | null
  actividad_principal?:  string | null
  /** null = nunca se consultó el padrón. */
  padron_consultado_at?: string | null
}

/** Fila de `v_pagos_proveedor_saldo`: el bloque «Deuda por proveedor». */
/** Compras › Cuentas (20260929s): un renglón de la cuenta corriente con el proveedor. */
export interface PagosCuentaMovimiento {
  fecha:         string
  tipo:          'factura' | 'nota_debito' | 'nota_credito' | 'pago'
  /** id de la factura / NC, o de la orden de pago si `tipo` es 'pago'. */
  ref_id:        number
  comprobante:   string
  detalle:       string
  debe:          number
  haber:         number
  /** Saldo corrido después de este renglón. Positivo = CADINC le debe. */
  saldo:         number
  estado:        string | null
  /** Factura importada «de meses ya pagados» cuyo pago todavía no se cargó. */
  a_reconstruir: boolean
  /** Orden de pago cargada después, desde el extracto (pago reconstruido). */
  reconstruida:  boolean
}

export interface PagosCuentaCorriente {
  proveedor:     { id: number; razon_social: string; cuit: string | null; codigo: string | null }
  desde:         string
  hasta:         string
  saldo_inicial: number
  movimientos:   PagosCuentaMovimiento[]
  total_debe:    number
  total_haber:   number
  saldo_final:   number
  /** Lo que el proveedor tiene «a reconstruir», a hoy (no depende del rango). */
  a_reconstruir: number
}

export interface PagosProveedorSaldo {
  proveedor_id:       number
  razon_social:       string
  proveedor_codigo?:  string | null
  cuit:               string | null
  activo:             boolean
  alias_cbu:          string | null
  cbu:                string | null
  cbu_ultimos4:       string | null
  facturas_abiertas:  number
  /** Pendientes que ya se pueden aprobar: sin las importadas sin imputar (20260929o). */
  para_aprobar:       number
  /** Pendientes importadas de ARCA sin concepto ni reparto: hay que imputarlas antes de aprobar (20260929o). */
  para_imputar?:      number
  saldo:              number
  saldo_aprobado:     number
  vencido:            number
  /** Vencimiento más viejo sin pagar. */
  mas_vieja:          string | null
  a_cuenta_sin_aplicar: number
  /** saldo − a cuenta sin aplicar − NC disponible (20260925). */
  saldo_neto:         number
  ultimo_pago:        string | null
  /** Crédito de NC aprobadas todavía sin aplicar a ninguna factura. */
  nc_disponible?:     number
  /** Saldo de compras de meses ya pagados (20260928): informativo, NO es deuda. */
  a_reconstruir?:     number
}

/** Una línea del historial de cambios de CBU/alias (sale de `audit_log`, enmascarada). */
export interface PagosHistorialDatosPago {
  id:          number
  created_at:  string
  user_id:     string | null
  user_nombre: string | null
  detalle:     string
}

/** Factura abierta que muestra la ficha del proveedor (subset de la vista). */
export interface PagosFacturaAbierta {
  id:               number
  tipo_comprobante: PagosTipoComprobante
  numero:           string | null
  fecha:            string
  vence_el:         string | null
  total:            number
  saldo:            number
  estado:           PagosEstadoFactura
  vencida:          boolean
  descripcion:      string
  clase?:           PagosClaseComprobante
  saldo_pagable?:   number
  nc_pendiente?:    number
  acreditado?:      number
  nc_txt?:          string | null
}

export interface PagosProveedorDetalle extends PagosProveedor {
  historial_datos_pago: PagosHistorialDatosPago[]
  facturas_abiertas:    PagosFacturaAbierta[]
  /** Contactos (20260925e): varios por proveedor, con «recibe avisos de pago». */
  contactos?:           import('./contactos').Contacto[]
}

/** Fila de `v_pagos_facturas`. */
export interface PagosFactura {
  id:                  number
  proveedor_id:        number
  tipo_comprobante:    PagosTipoComprobante
  numero:              string | null
  numero_norm:         string | null
  fecha:               string
  /** Opcional: una factura puede no tener vencimiento (recibo, ticket). */
  vence_el:            string | null
  neto:                number | null
  iva:                 number | null
  percepciones:        number | null
  otros:               number | null
  total:               number
  /** `total − percepciones`: lo que se reparte entre obras. */
  imputable:           number
  forma_pago_prevista: PagosFormaPrevista
  estado:              PagosEstadoFactura
  paga_cliente:        boolean
  pagada_al_cargar:    boolean
  aprobada_por:        string | null
  aprobada_at:         string | null
  aprobada_por_nombre: string | null
  motivo_observacion:  string | null
  observada_por:       string | null
  observada_at:        string | null
  observada_por_nombre: string | null
  motivo_anulacion:    string | null
  anulado_por:         string | null
  anulado_at:          string | null
  anulado_por_nombre:  string | null
  descripcion:         string
  obs:                 string
  created_at:          string
  updated_at:          string
  created_by:          string | null
  created_by_nombre:   string | null
  updated_by:          string | null
  proveedor_nom:       string
  proveedor_cuit:      string | null
  /** «PRV-0001» (20260925). */
  proveedor_codigo:    string | null
  proveedor_activo:    boolean
  proveedor_alias:     string | null
  proveedor_cbu:       string | null
  proveedor_cbu_ultimos4: string | null
  datos_pago_actualizados_at:  string | null
  datos_pago_actualizados_por: string | null
  /** ⚠ El CBU del proveedor cambió DESPUÉS de que se aprobó esta factura. */
  cuenta_cambio_tras_aprobar: boolean
  /** Plata aplicada (líneas `factura` de OP vigentes). */
  pagado:              number
  /** Notas de crédito aplicadas: bajan el saldo sin que salga plata. */
  acreditado:          number
  saldo:               number
  vencida:             boolean
  /** > 0 vencida, < 0 por vencer, null sin vencimiento. */
  dias_vencida:        number | null
  /** Pagada al cargar y todavía sin sello del aprobador. */
  sin_revisar:         boolean
  mes_emision:         string
  /** Centro de la imputación más grande; null si la factura no tiene imputaciones. */
  centro_costo:        string | null
  /** Texto del reparto: «LAMADRID $120000 · CC CADINC $30000». */
  centros:             string | null
  obras_cod:           string[] | null
  centros_cc:          string[] | null
  /** Toca alguna obra interna o el depósito. */
  es_interna:          boolean | null
  todas_archivadas:    boolean | null
  tiene_factura_adj:   boolean
  sin_numero:          boolean
  /** Último control automático del comprobante (20260921k). null = todavía no se controló. */
  control_estado:      PagosEstadoControl | null
  control_nota:        string | null
  /** «OP-0012» de la última orden vigente que la tocó. */
  ultima_op:           string | null
  ultimo_pago:         string | null
  busq:                string
  /** El plan de e-cheqs anotado al cargarla (20260923n). */
  plan_cheques?:       PagosPlanCheques | null
  // ── Como lo pide ARCA (20260924u) ──
  no_gravado?:         number | null
  exento?:             number | null
  cae?:                string | null
  cae_vto?:            string | null
  /** Código ARCA del comprobante: 1 = Factura A, 6 = B, 11 = C… */
  cbte_tipo_arca?:     number | null
  /** De dónde salieron los datos al cargarla. */
  lectura_estado?:     PagosLecturaEstado
  desglose_a_revisar?: boolean
  // ── NC como comprobante (20260925) ──
  clase:               PagosClaseComprobante
  /** NC: lo que ya aplicó a facturas. En una factura, 0. */
  nc_aplicado:         number
  /** NC aprobada y no anulada: total − aplicado. Si no, 0. */
  nc_disponible:       number
  /** Factura: lo reservado por NC todavía sin aprobar. */
  nc_pendiente:        number
  /** Factura: max(saldo − nc_pendiente, 0). Es el tope de una orden de pago. */
  saldo_pagable:       number
  /** Factura: «NC A 0003-00000012 $300.00 (sin aprobar)»; NC: «s/ A 0001-00000045, …». */
  nc_txt:              string | null
  // ── Concepto de compra (20260925) ──
  /** null solo en facturas viejas: el alta lo exige. */
  concepto_id:         number | null
  /** Nombre del concepto. */
  concepto:            string | null
  // ── Período IVA (20260927a) ──
  /** Mes (día 1, `YYYY-MM-01`) en que se informa en el Libro IVA compras. Default = mes de `fecha`. */
  periodo_iva:          string
  /** El período IVA no es el mes de la fecha (se corrió). */
  periodo_iva_distinto: boolean
  // ── Importadas de ARCA «Mis Comprobantes Recibidos» (20260927b/c) ──
  /** Falta concepto y reparto por obra: no se aprueba ni se paga hasta imputarla. */
  sin_imputar:          boolean
  /** «Otros tributos» de ARCA sin clasificar: se clasifican con «Completar desglose» antes de imputar. */
  tributos_a_revisar:   boolean
  origen_carga:         PagosOrigenCarga
  importacion_id:       number | null
  // ── Compras de meses ya pagados (20260928) ──
  /**
   * Importada como histórica: el pago ya ocurrió y se reconstruye con los
   * extractos. No es deuda, no vence, no se aprueba ni avisa. Sí cuenta para
   * el Libro IVA, la contabilidad y la imputación.
   */
  pago_a_reconstruir:   boolean
}

export type PagosOrigenCarga = 'manual' | 'arca_recibidos'

// ── Importador de «Mis Comprobantes Recibidos» (20260927c) ──

/** Una fila del archivo de ARCA, ya normalizada (espejo de `FilaRecibidaSchema` del backend). */
export interface PagosFilaRecibida {
  fecha:               string
  cbte_tipo:           number
  pto_vta:             number
  numero:              number
  numero_hasta?:       number | null
  cod_autorizacion?:   string | null
  emisor_doc_tipo:     number | string
  emisor_doc_nro:      string
  emisor_razon_social: string
  moneda:              string
  tipo_cambio:         number
  neto_gravado:        number
  no_gravado:          number
  exento:              number
  otros_tributos:      number
  iva:                 number
  total:               number
  /** null = formato clásico (sin columnas por alícuota). */
  alicuotas?:          { alicuota_id: PagosAlicuotaId; base_imp: number; importe: number }[] | null
}

export interface PagosImportarRecibidosInput {
  filas:         PagosFilaRecibida[]
  archivo?:      string
  hash_sha256?:  string | null
  confirmar:     boolean
  /** De meses ya pagados (20260928): entran con `pago_a_reconstruir`. */
  historica?:    boolean
  /** Período IVA (primer día del mes) de las filas con fecha de ese mes o anterior (20260928g). */
  periodo_iva?:  string | null
}

export interface PagosImportarAviso {
  codigo:  string
  detalle: Record<string, unknown> | null
}

export interface PagosImportarRecibidosFila {
  indice:                number
  estado:                'nueva' | 'duplicada' | 'error'
  error:                 string | null
  detalle:               Record<string, unknown> | null
  avisos:                PagosImportarAviso[]
  fecha:                 string | null
  /** Período IVA con el que entra (20260928g; ausente en respuestas viejas). */
  periodo_iva?:          string | null
  cbte_tipo:             number | null
  tipo_comprobante:      PagosTipoComprobante | null
  clase:                 PagosClaseComprobante | null
  numero:                string | null
  cuit:                  string | null
  razon_social:          string | null
  proveedor_id:          number | null
  proveedor_nuevo:       boolean
  neto:                  number | null
  iva:                   number | null
  no_gravado:            number | null
  exento:                number | null
  otros_tributos:        number | null
  total:                 number | null
  iva_detalle:           PagosIvaDetalle[] | null
  desglose_a_revisar:    boolean
  tributos_a_revisar:    boolean
  factura_id:            number | null
  factura_id_existente:  number | null
}

export interface PagosImportarRecibidosRes {
  confirmado:          boolean
  importacion_id:      number | null
  total_filas:         number
  nuevas:              number
  duplicadas:          number
  errores:             number
  a_revisar_desglose:  number
  a_revisar_tributos:  number
  moneda_extranjera:   number
  proveedores_nuevos:  { cuit: string; razon_social: string; proveedor_id: number | null }[]
  por_mes:             { periodo: string; nuevas: number; total: number }[]
  filas:               PagosImportarRecibidosFila[]
}

export interface PagosImportacion {
  id:                 number
  archivo:            string
  hash_sha256:        string | null
  fecha_desde:        string | null
  fecha_hasta:        string | null
  filas:              number
  nuevas:             number
  duplicadas:         number
  proveedores_nuevos: number
  created_at:         string
  created_by_nombre:  string | null
  /** De meses ya pagados (20260928). Backend viejo: ausente. */
  historica?:           boolean
  /** Deshecha (20260929k): sus facturas quedaron anuladas. */
  deshecha_at?:         string | null
  deshecha_por_nombre?: string | null
  motivo_deshacer?:     string | null
  /** Facturas de la importación que no están anuladas (null si no se pudo contar). */
  facturas_vigentes?:   number | null
}

export type PagosBloqueoDeshacerMotivo = 'con_pago' | 'con_nc' | 'imputada' | 'aprobada' | 'asiento_periodo_cerrado'

export interface PagosBloqueoDeshacer {
  factura_id:       number
  numero:           string | null
  tipo_comprobante: string | null
  proveedor:        string | null
  motivo:           PagosBloqueoDeshacerMotivo
}

/** GET/POST /api/pagos/importaciones/:id/deshacer (20260929k). */
export interface PagosDeshacerImportacionRes {
  importacion:       { id: number; archivo: string | null; created_at: string; historica: boolean; filas: number }
  total:             number
  a_anular:          number
  ya_anuladas:       number
  asientos_a_anular: number
  bloqueos:          PagosBloqueoDeshacer[]
  puede:             boolean
  aplicado:          boolean
}

export interface PagosImputarFacturaInput {
  concepto_id:   number
  imputaciones:  PagosImputacionInput[]
  descripcion?:  string
}

export interface PagosImputarLoteInput {
  ids:          number[]
  concepto_id:  number
  obra_cod:     string
}

/** `GET /facturas/periodo-iva-sugerido?fecha=` */
export interface PagosPeriodoIvaSugerido {
  periodo_iva: string
  /** Difiere del mes de la fecha: ese mes ya está cerrado en Contabilidad. */
  corrido:     boolean
}

/**
 * «Marcar pagadas» (20260927h): compras ya pagadas con la tarjeta de la
 * empresa o con saldo de Mercado Pago. Una OP POR FACTURA, cada una a su
 * proveedor. `forma_pago` sale del tipo de la cuenta (tarjeta → 'tarjeta',
 * billetera → 'otro'). Sin `fecha`, cada una en la fecha de su factura.
 */
export interface PagosMarcarPagadasInput {
  factura_ids:      number[]
  cuenta_origen_id: number
  forma_pago:       'tarjeta' | 'otro'
  fecha?:           string
}
export interface PagosMarcarPagadasRes {
  ordenes: { factura_id: number; orden_id: number; numero: number }[]
  total:   number
}

// ── Desglose de impuestos y lectura del comprobante (20260924u) ──

export type PagosLecturaEstado = 'manual' | 'qr' | 'qr+ia' | 'ia'
/** Código ARCA de alícuota: 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %. */
export type PagosAlicuotaId = 3 | 4 | 5 | 6 | 8 | 9
export interface PagosIvaDetalle {
  alicuota_id: PagosAlicuotaId
  base_imp:    number
  importe:     number
}
export type PagosTributoTipo =
  | 'percepcion_iva' | 'percepcion_iibb' | 'percepcion_ganancias'
  | 'percepcion_municipal' | 'impuestos_internos'
  /** Impuesto sobre los Combustibles Líquidos (ICL/ITC) e Impuesto al Dióxido de Carbono (20261001a). No son percepciones. */
  | 'icl' | 'idc'
  | 'otro'
export interface PagosTributo {
  id?:          number
  tipo:         PagosTributoTipo
  jurisdiccion: string | null
  /** 20260929f: jurisdicción del catálogo (null = texto sin resolver o sin jurisdicción). */
  jurisdiccion_id?: number | null
  descripcion:  string
  alicuota:     number | null
  base_imp:     number | null
  importe:      number
}
export type PagosFuenteCampo = 'qr' | 'ia' | 'qr+ia'
export interface PagosAvisoLectura {
  campo:     string
  mensaje:   string
  severidad: 'error' | 'advertencia' | 'info'
  codigo:    string
  /** QR y papel no coinciden: lo que dice el papel, para usarlo con un clic. */
  alternativa?: string | number | null
  /** FACTURA_YA_CARGADA / ARCHIVO_YA_CARGADO: cuál es, para «Completar la ya cargada». */
  factura_id?: number
}
export interface PagosPropuestaLectura {
  emisor_cuit:         string | null
  emisor_razon_social: string | null
  receptor_cuit:       string | null
  cbte_tipo_arca:      number | null
  tipo_comprobante:    PagosTipoComprobante | null
  punto_venta:         string | null
  numero_comprobante:  string | null
  fecha:               string | null
  vence_el:            string | null
  cae:                 string | null
  cae_vto:             string | null
  moneda:              string | null
  cotizacion:          number | null
  neto:                number | null
  no_gravado:          number | null
  exento:              number | null
  iva:                 PagosIvaDetalle[]
  tributos:            PagosTributo[]
  total:               number | null
  /** Qué se compró, en pocas palabras (leído): precarga la descripción. */
  descripcion:         string | null
  proveedor_id:        number | null
  proveedor_nombre:    string | null
  proveedor_nuevo:     { razon_social: string | null; cuit: string } | null
  /** Si el código leído es de NC, 'nota_credito' (20260925). */
  clase?:              PagosClaseComprobante | null
  /** Comprobantes que la NC dice acreditar, como vienen en el papel. */
  comprobantes_asociados?: { letra: string | null; punto_venta: string | null; numero: string | null }[] | null
  /** También viene en la RAÍZ de la respuesta: usar la de la raíz (`PagosLecturaRes`). */
  aplica_a_sugerida?:  PagosAplicaNcSugerida[] | null
  /** Concepto de compra que sugiere la IA según lo comprado (20260925). */
  concepto_id_sugerido?: number | null
  concepto_sugerido?:    string | null
}
/** Factura abierta del proveedor que la lectura cruzó con un comprobante asociado de la NC. */
export interface PagosAplicaNcSugerida extends PagosAplicaNcInput {
  tipo_comprobante?: PagosTipoComprobante | null
  numero?:           string | null
  saldo_pagable?:    number | null
}
export interface PagosLecturaRes {
  lectura_id:       number
  estado:           PagosLecturaEstado
  modelo:           string | null
  propuesta:        PagosPropuestaLectura
  fuente_por_campo: Record<string, PagosFuenteCampo>
  avisos:           PagosAvisoLectura[]
  /** Solo NC: a qué facturas abiertas acredita, cruzado por número (20260925). */
  aplica_a_sugerida?: PagosAplicaNcSugerida[] | null
}

/** POST /facturas/:id/leer-adjunto (20260924v): la propuesta de desglose del adjunto ya guardado. No guarda nada. */
export interface PagosDesgloseInput {
  iva_detalle:     { alicuota_id: PagosAlicuotaId; base_imp: number; importe: number }[]
  tributos:        { tipo: PagosTributoTipo; jurisdiccion: string | null; jurisdiccion_id?: number | null; descripcion: string; alicuota: number | null; base_imp: number | null; importe: number }[]
  no_gravado:      number | null
  exento:          number | null
  /** Sólo sin alícuotas (B/C). */
  neto:            number | null
  cae:             string | null
  cae_vto:         string | null
  cbte_tipo_arca:  number | null
}
export interface PagosCierreDesglose {
  total_papel:          number | null
  total_factura:        number
  total_igual:          boolean
  suma_desglose:        number
  cuadra_con_total:     boolean
  percepciones_papel:   number
  percepciones_factura: number
  percepciones_iguales: boolean
  sin_iva:              boolean
}
export interface PagosDesgloseLeidoRes {
  adjunto_id:       number
  nombre_archivo:   string
  estado:           PagosLecturaEstado
  modelo:           string | null
  qr_leido:         boolean
  desglose:         PagosDesgloseInput
  cierre:           PagosCierreDesglose
  /** Total igual, cierra y percepciones iguales: se puede guardar tal cual. */
  completable:      boolean
  fuente_por_campo: Record<string, PagosFuenteCampo>
  avisos:           PagosAvisoLectura[]
}
export interface PagosCompletarDesgloseRes {
  factura:                PagosFactura
  percepciones_cambiadas: boolean
  imputacion_ajustada:    boolean
}

/** Obra a la que se imputa parte de la factura (centro de costo). */
export interface PagosImputacion {
  id:         number
  obra_cod:   string
  monto:      number
  obs:        string
  created_at: string
  updated_at: string
  obra:       {
    cod:         string
    nom:         string
    cc:          string | null
    es_interna:  boolean | null
    es_deposito: boolean | null
    archivada:   boolean | null
  } | null
}

/** Adjunto de factura o de OP (bucket privado `pagos-docs`, se abre con signed URL). */
export interface PagosAdjunto {
  id:             number
  tipo:           PagosTipoAdjFactura | PagosTipoAdjOrden
  storage_path:   string
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  hash_sha256:    string
  obs:            string
  created_at:     string
  created_by:     string | null
  updated_at:     string
  updated_by:     string | null
  deleted_at:     string | null
  /** El backend lo deriva de `deleted_at`: se muestra tachado, no se oculta. */
  borrado:        boolean
}

/** Una línea de OP vista desde la ficha de la factura. */
export interface PagosPagoAplicado {
  id:         number
  orden_id:   number
  tipo:       PagosTipoLinea
  monto:      number
  nc_numero:  string | null
  nc_fecha:   string | null
  created_at: string
  orden: {
    id:                   number
    numero:               number
    numero_fmt:           string | null
    fecha:                string
    fecha_cobro:          string | null
    forma_pago:           PagosFormaPagoOPGuardada
    referencia:           string
    estado:               PagosEstadoOrden
    motivo_anulacion:     string | null
    anulado_at:           string | null
    cbu_destino:          string | null
    alias_destino:        string | null
    cbu_destino_ultimos4: string | null
    monto_pagado:         number
    anulada:              boolean
  }
}

/**
 * Control automático del comprobante contra lo tipeado (20260921j). Tres
 * datos: número, total y fecha de emisión (la fecha desde 20260923a). `null` si todavía no se controló (o si no hay key
 * de IA cargada: el módulo anda igual, simplemente no controla).
 */
export type PagosEstadoControl = 'coincide' | 'difiere' | 'ilegible' | 'error'

export interface PagosControlFactura {
  id:           number
  estado:       PagosEstadoControl
  numero_leido: string | null
  total_leido:  number | null
  /** null = no se pudo leer ese dato, que NO es lo mismo que «está bien». */
  numero_ok:    boolean | null
  total_ok:     boolean | null
  /** ISO. Los controles anteriores al 23/09 no leían la fecha: null. */
  fecha_leida?: string | null
  fecha_ok?:    boolean | null
  nota:         string
  created_at:   string
}

/** Un comprobante (NC o factura) visto desde una aplicación. */
export interface PagosComprobanteAplicado {
  id:               number
  clase?:           PagosClaseComprobante | null
  tipo_comprobante: PagosTipoComprobante
  cbte_tipo_arca?:  number | null
  numero:           string | null
  fecha:            string
  total:            number
  estado:           PagosEstadoFactura
  aprobada_at?:     string | null
  saldo?:           number | null
  saldo_pagable?:   number | null
  nc_disponible?:   number | null
}

/**
 * Una aplicación de NC a factura (`pagos_nc_aplicaciones`), vista desde la
 * ficha: en la NC, a qué facturas acredita; en la factura, qué NC la acreditan.
 *
 * ⚠ La forma exacta la confirma el backend. Al 24/09 el service
 * (`aplicacionesDe`) manda los dos comprobantes anidados en `nc` y `factura`,
 * más `vigente`/`aprobada`; se aceptan también los campos planos de la
 * contraparte por si cambia. Leerla SIEMPRE con `contraparteAplicacion()`.
 */
export interface PagosAplicacionNc {
  id?:               number
  nc_id:             number
  factura_id:        number
  monto:             number
  created_at?:       string | null
  /** La NC no está anulada. */
  vigente?:          boolean | null
  /** La NC está aprobada: ya bajó la deuda (si no, es reserva). */
  aprobada?:         boolean | null
  nc?:               PagosComprobanteAplicado | null
  factura?:          PagosComprobanteAplicado | null
  // Forma plana alternativa (contraparte).
  numero?:           string | null
  tipo_comprobante?: PagosTipoComprobante | null
  fecha?:            string | null
  estado?:           PagosEstadoFactura | null
  total?:            number | null
  clase_contraparte?: PagosClaseComprobante | null
}

export interface PagosFacturaDetalle extends PagosFactura {
  imputaciones: PagosImputacion[]
  /** NC ↔ facturas (20260925). Puede faltar hasta el deploy del backend. */
  aplicaciones?: PagosAplicacionNc[]
  /** IVA por alícuota y percepciones/tributos (20260924u). Vacíos = sin discriminar. */
  iva_detalle?: PagosIvaDetalle[]
  tributos?:    PagosTributo[]
  adjuntos:     PagosAdjunto[]
  pagos:        PagosPagoAplicado[]
  control:      PagosControlFactura | null
  aprobacion: {
    aprobada_por:        string | null
    aprobada_por_nombre: string | null
    aprobada_at:         string | null
    cuenta_cambio_tras_aprobar: boolean
    datos_pago_actualizados_at: string | null
  }
}

/** Fila de `v_pagos_ordenes`. */
export interface PagosOrden {
  id:                number
  numero:            number
  /** «OP-0012». */
  numero_fmt:        string
  proveedor_id:      number
  fecha:             string
  /** Cheque / e-cheq: la PRIMERA fecha de cobro de sus cheques (la deriva la RPC). */
  fecha_cobro:       string | null
  /** `nota_credito` = la OP no movió plata; la UI lo muestra «Solo nota de crédito». */
  forma_pago:        PagosFormaPagoOPGuardada
  referencia:        string
  /** Foto del padrón al registrar (sin `ver_pii` llega enmascarado). */
  cbu_destino:       string | null
  alias_destino:     string | null
  cbu_destino_ultimos4: string | null
  /** Σ líneas `factura` + `a_cuenta`: lo que salió del banco. */
  monto_pagado:      number
  /** Σ líneas `nota_credito`. */
  monto_nc:          number
  monto_aplicado:    number
  estado:            PagosEstadoOrden
  motivo_anulacion:  string | null
  anulado_por:       string | null
  anulado_at:        string | null
  anulado_por_nombre: string | null
  obs:               string
  created_at:        string
  updated_at:        string
  created_by:        string | null
  created_by_nombre: string | null
  updated_by:        string | null
  proveedor_nom:     string
  proveedor_cuit:    string | null
  /** «PRV-0001» (20260925). */
  proveedor_codigo:  string | null
  /** Texto de las líneas: «A 0001-00012345, NC 0003-1234 s/ A 0001-00012345». */
  facturas:          string | null
  /**
   * Si ya se avisó por mail (20260921m). Solo cuenta un envío que SALIÓ: un
   * fallo o un «no había dirección» no son «ya se avisó».
   */
  aviso_proveedor:   boolean
  aviso_contador:    boolean
  aviso_ultimo_at:   string | null
  /** El mail del padrón, para saber si se puede avisar sin ir a buscarlo. */
  proveedor_email:   string | null
  /**
   * Registro contable (20260923c): el número de la OP en Finnegans que carga
   * el contador. null = todavía no la pasó. Si la OP se anula, el número queda
   * para recordar que hay que anularla también allá.
   */
  numero_finnegans:      string | null
  registrada_at:         string | null
  registrada_por_nombre: string | null
  cantidad_facturas: number
  a_cuenta:          number
  tiene_nc:          boolean
  tiene_comprobante: boolean
  tiene_nc_adjunto:  boolean
  /** Transferencia o e-cheq con plata: el comprobante es obligatorio. */
  comprobante_requerido: boolean
  /** Cheque emitido cuya fecha de cobro todavía no llegó. */
  en_cartera:        boolean
  /** Tiene un adjunto vigente tipo `recibo_proveedor` (20260925q). Opcional hasta el deploy. */
  tiene_recibo?:     boolean
  /**
   * De qué cuenta propia (tesorería) salió la plata (20260926g). null = sin
   * indicar: todas las OP anteriores. Opcionales hasta el deploy del backend.
   */
  cuenta_origen_id?:     number | null
  cuenta_origen_nombre?: string | null
  mes_pago:          string
  busq:              string
}

/** Cuenta propia de CADINC para «Sale de la cuenta» (GET /api/pagos/cuentas-origen). */
export interface PagosCuentaOrigen {
  id:     number
  /** `tarjeta` y `billetera` desde 20260927h (compras pagadas con tarjeta o Mercado Pago). */
  tipo:   'banco' | 'caja' | 'valores' | 'tarjeta' | 'billetera'
  nombre: string
  banco:  string
  moneda: 'ARS' | 'USD'
}

/** Línea de OP con la factura embebida (ficha de la orden). */
export interface PagosOrdenLinea {
  id:         number
  tipo:       PagosTipoLinea
  factura_id: number | null
  monto:      number
  nc_numero:  string | null
  nc_fecha:   string | null
  created_at: string
  factura: {
    id:               number
    tipo_comprobante: PagosTipoComprobante
    numero:           string | null
    fecha:            string
    vence_el:         string | null
    total:            number
    estado:           PagosEstadoFactura
    descripcion:      string
    /**
     * Los papeles de LA FACTURA (20260921). No son los de la orden: el
     * comprobante del pago y las notas de crédito cuelgan de la OP, la factura
     * escaneada cuelga de la factura. Desde la OP hay que poder abrir las dos
     * —es el par que se mira junto— y hasta hoy sólo se veía el comprobante.
     * Shape reducido: lo justo para listarlos y pedir la URL firmada.
     */
    adjuntos: PagosAdjuntoDeFactura[]
    /**
     * Las NC vigentes aplicadas a esta factura (20260925), con sus papeles.
     * Informativo: la OP es solo plata, esto NO suma a sus totales.
     */
    notas_credito?: (PagosAplicacionNc & { adjuntos?: PagosAdjuntoDeFactura[] })[]
  } | null
}

/** Un papel de la factura, visto desde la orden de pago. */
export interface PagosAdjuntoDeFactura {
  id:             number
  factura_id:     number
  tipo:           PagosTipoAdjFactura
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  created_at:     string
}

/**
 * Un cheque o e-cheq de la orden. Va uno por fila: lo que se pregunta (qué cae
 * esta semana, cuánto hay en cartera, cuál rebotó) es por cheque, no por orden.
 */
export interface PagosCheque {
  id:          number
  numero:      string
  banco:       string
  fecha_cobro: string
  monto:       number
  /** false = endosado de un tercero, y entonces `librador` dice de quién era. */
  es_propio:   boolean
  librador:    string
  obs:         string
}

/** Lo que se manda al registrar el pago (sin `id`, lo pone la base). */
export type PagosChequeNuevo = Omit<PagosCheque, 'id'> & {
  /**
   * La foto del cheque ya subida (el `storage_path` que devolvió
   * `POST /cheques/leer`). El backend la adjunta a la OP como tipo `cheque`
   * con obs «Cheque N° X». NO reemplaza el comprobante de pago.
   */
  foto_path?: string | null
}

/** Lo que la IA leyó de la foto de un cheque (`POST /api/pagos/cheques/leer`). No crea nada. */
export interface PagosChequePropuesta {
  numero:        string | null
  banco:         string | null
  /** YYYY-MM-DD. */
  fecha_cobro:   string | null
  importe:       number | null
  librador:      string | null
  librador_cuit: string | null
  es_echeq:      boolean | null
  es_diferido:   boolean | null
  /** true si lo libró CADINC, false si es de un tercero, null si no se sabe. */
  es_propio?:        boolean | null
  /** A quién se le entrega: el beneficiario, o el endosatario en un endoso (2026-09-25). */
  entregado_a?:      string | null
  entregado_a_cuit?: string | null
}
export interface PagosChequeLecturaRes {
  propuesta:    PagosChequePropuesta
  /** Forma abierta: puede venir como aviso de lectura (`codigo`/`mensaje`) o como aviso seco (`code`). */
  avisos:       (Partial<PagosAvisoLectura> & { code?: string; [k: string]: unknown })[]
  /** Todos los cheques del archivo (un PDF del banco puede traer la emisión y
   *  varios endosos, 2026-09-25); `propuesta`/`avisos` sueltos son el primero. */
  cheques?:     {
    propuesta: PagosChequePropuesta
    avisos:    PagosChequeLecturaRes['avisos']
    /** El proveedor de Compras al que va, si se reconoció (por CUIT o nombre). */
    proveedor?: { id: number; razon_social: string; por: 'cuit' | 'nombre' } | null
  }[]
  storage_path: string
}

/**
 * Una orden con sus cheques, como la devuelve `/ordenes/export`. El Excel
 * necesita los cheques de todas las órdenes juntos —«qué cae esta semana»— y
 * pedirlos de a uno por orden serían cientos de requests.
 */
/**
 * El manifiesto del paquete para el contador: qué archivos hay y dónde
 * bajarlos. El backend NO manda el ZIP — manda las URLs firmadas a 15 minutos
 * y el navegador arma el ZIP, así el server no se come un período de PDFs.
 *
 * El eje es la ORDEN DE PAGO, no la factura: el contador concilia por lo que
 * salió del banco en el período. Una factura de agosto pagada en septiembre
 * entra en septiembre.
 */
export interface PagosPaqueteArchivo {
  adjunto_id:     number
  tipo:           string
  /** 'factura' = papel de la factura; 'pago' = comprobante con el que salió la plata; 'nota_credito' = papel de una NC aplicada a la factura. */
  origen:         'factura' | 'pago' | 'nota_credito'
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  /** null si storage no la pudo firmar; el archivo se anota como faltante. */
  url:            string | null
}

/** Una factura cubierta por esa OP, con lo que ESTA OP le aplicó. */
export interface PagosPaqueteFactura {
  id:               number
  tipo_comprobante: PagosTipoComprobante | null
  numero:           string | null
  fecha:            string | null
  total:            number | null
  estado:           PagosEstadoFactura | null
  descripcion:      string
  /** Lo aplicado por esta OP. En un pago parcial es menos que el total. */
  aplicado:         number
  archivos:         PagosPaqueteArchivo[]
  /** NC vigentes aplicadas a la factura (no son plata de esta OP), con sus archivos. */
  notas_credito?:   PagosPaqueteNc[]
}

export interface PagosPaqueteNc {
  nc_id:            number
  tipo_comprobante: PagosTipoComprobante | null
  numero:           string | null
  fecha:            string | null
  total:            number | null
  estado:           PagosEstadoFactura | null
  aprobada:         boolean
  monto_aplicado:   number
  archivos:         PagosPaqueteArchivo[]
}

export interface PagosPaqueteOrden {
  id:             number
  numero:         number
  numero_fmt:     string
  fecha:          string
  forma_pago:     PagosFormaPagoOPGuardada
  estado:         PagosEstadoOrden
  monto_pagado:   number
  monto_nc:       number
  proveedor_nom:  string
  proveedor_cuit: string | null
  /** Comprobantes del pago (y PDFs de notas de crédito). */
  archivos:       PagosPaqueteArchivo[]
  facturas:       PagosPaqueteFactura[]
}

export interface PagosPaquete {
  generado_en: string
  ordenes:     PagosPaqueteOrden[]
}

/** Aviso de pago por mail: el resultado de un intento (20260921m). */
export interface PagosAvisoResultado {
  /** `compras` (20260929x): copia del paquete del contador a Compras. */
  destinatario: 'proveedor' | 'contador' | 'compras'
  /** `omitido` = no había dirección. No es un fallo, pero tampoco es avisado. */
  estado:       'enviado' | 'fallado' | 'omitido'
  email:        string | null
  adjuntos:     string[]
  error:        string
}

/** Una fila del registro de avisos de una orden. */
export interface PagosAviso extends PagosAvisoResultado {
  id:          number
  enviado_at:  string
  enviado_por: string | null
}

/** ¿Este servidor puede mandar mail? Si no, la UI lo dice en vez de fallar. */
export interface PagosMailEstado {
  configurado: boolean
  /** Las variables que faltan, para poder decirlo sin adivinar. */
  falta:       string[]
}

export interface PagosOrdenExport extends PagosOrden {
  cheques: PagosCheque[]
}

export interface PagosOrdenDetalle extends PagosOrden {
  lineas:   PagosOrdenLinea[]
  cheques:  PagosCheque[]
  adjuntos: PagosAdjunto[]
}

/** Obra como centro de costo (`GET /api/pagos/catalogos/obras`, trae archivadas). */
export interface PagosCatalogoObra {
  cod:         string
  nom:         string
  cc:          string | null
  es_interna:  boolean | null
  es_deposito: boolean | null
  archivada:   boolean | null
}

// ── Páginas y agregados ───────────────────────────────────────────────

export interface PagosPage<T> {
  items:   T[]
  total:   number
  limit:   number
  offset:  number
  hasMore: boolean
}

export type PagosFacturasPage    = PagosPage<PagosFactura>
export type PagosProveedoresPage = PagosPage<PagosProveedor>

export interface PagosOrdenesPage extends PagosPage<PagosOrden> {
  /** Totales del filtro completo (no de la página): salen de la RPC de resumen. */
  totales: { ordenes: number; monto_pagado: number; monto_nc: number }
}

export type PagosFacturasGrupo =
  | 'proveedor' | 'centro_costo' | 'obra' | 'mes_emision' | 'estado' | 'vencimiento' | 'forma_pago'
export type PagosOrdenesGrupo = 'mes_pago' | 'proveedor' | 'forma_pago' | 'centro_costo' | 'obra'
/** Eje del resumen de OP: `op` = fecha de la orden, `cobro` = fecha de cobro del cheque. */
export type PagosOrdenesEje = 'op' | 'cobro'

/**
 * Fila de `pagos_resumen` (eje EMISIÓN). Por obra/centro los importes vienen
 * prorrateados por imputación: el total de facturas distintas no es la suma
 * de las filas.
 */
export interface PagosResumenGrupo {
  grupo:          string
  grupo_nom:      string
  es_interna:     boolean | null
  estado:         string | null
  /** Solo facturas (las NC van en `notas_credito`). */
  facturas:       number
  /** Cantidad de NC del grupo (20260925). */
  notas_credito?: number
  /** Con signo: la NC resta. */
  total:          number
  /** Con signo: la NC resta. */
  imputable:      number
  pagado:         number
  acreditado:     number
  saldo:          number
  saldo_aprobado: number | null
  vencido:        number | null
  ultimo:         string | null
}

/** Fila de `pagos_ordenes_resumen` (eje FECHA DE PAGO). */
export interface PagosOrdenesResumenGrupo {
  grupo:        string
  grupo_nom:    string
  es_interna:   boolean | null
  ordenes:      number
  monto_pagado: number
  monto_nc:     number
  a_cuenta:     number
  en_cartera:   number
}

export interface PagosFacturasResumen { grupos: PagosResumenGrupo[] }
export interface PagosOrdenesResumen  { grupos: PagosOrdenesResumenGrupo[] }

// ── Bodies de las mutaciones (espejo de los zod del backend) ───────────

export interface PagosImputacionInput {
  obra_cod: string
  monto:    number
  obs?:     string
}

/** Archivo ya subido con la signed URL; viaja en el body de la mutación. */
export interface PagosAdjuntoPendiente {
  tipo:           PagosTipoAdjOrden
  storage_path:   string
  nombre_archivo: string
  mime_type:      string
}

// ── «Soltá acá los comprobantes de pagos» (POST /api/pagos/comprobantes/leer, 2026-09-25) ──

export interface PagosAvisoComprobante { severidad: 'error' | 'advertencia' | 'info'; codigo: string; mensaje: string }

/** Lo que la IA leyó de un comprobante de pago a un proveedor. No crea nada. */
export interface PagosComprobanteLectura {
  tipo_documento:   'transferencia' | 'echeq' | 'cheque' | 'recibo' | 'resumen_cuenta' | 'otro'
  fecha:            string | null
  proveedor_nombre: string | null
  proveedor_cuit:   string | null
  proveedor:        { id: number; razon_social: string; por: 'cuit' | 'nombre' } | null
  medios: Array<{
    forma:        'transferencia' | 'echeq' | 'cheque' | 'efectivo' | 'otro'
    importe:      number | null
    numero:       string | null
    banco:        string | null
    fecha_cobro:  string | null
    librador:     string | null
    librador_cuit: string | null
    /** false = cheque de un tercero endosado. */
    es_propio:    boolean | null
    cuenta_origen_texto: string | null
    /** A quién se entregó ESTE medio (un PDF de endosos puede ir a varios proveedores). */
    entregado_a:  string | null
    entregado_a_cuit: string | null
    /** El proveedor de este medio si se reconoce; si no, el del documento. */
    proveedor_id: number | null
    avisos:       PagosAvisoComprobante[]
  }>
  comprobantes: Array<{ tipo: string | null; pto_vta: number; numero: number; numero_fmt: string; importe: number | null }>
  /** Del proveedor: primero las que nombra el papel, después las que tienen saldo. */
  facturas: Array<{
    id: number; proveedor_id: number; numero: string | null; fecha: string; total: number; saldo: number; estado: string
    pago_a_reconstruir: boolean; nombrada: boolean; importe_papel: number | null
  }>
  cuenta_origen_id: number | null
  recibo_numero:    string | null
  total:            number | null
  avisos:           PagosAvisoComprobante[]
  modelo:           string | null
  storage_path:     string
}

/** POST /api/pagos/ordenes/reconstruir: un pago que ya se hizo. */
export interface PagosReconstruirInput {
  proveedor_id:      number
  fecha:             string
  forma_pago:        'transferencia' | 'echeq' | 'cheque' | 'efectivo' | 'otro'
  monto_pagado:      number
  cuenta_origen_id?: number | null
  referencia:        string
  obs?:              string
  cheques?:          { numero: string; banco: string; fecha_cobro: string; monto: number; es_propio: boolean; librador: string }[]
  lineas:            { factura_id: number; monto: number }[]
  a_cuenta?:         number
  adjuntos:          PagosAdjuntoPendiente[]
}

/** La OP que nace junto con la factura cuando compras tilda «Ya está pagada». */
export interface PagosOrdenAlCargarInput {
  fecha:        string
  forma_pago:   PagosFormaPagoOP
  referencia?:  string
  fecha_cobro?: string | null
  obs?:         string
  comprobante?: PagosAdjuntoPendiente | null
  /** De qué cuenta de tesorería sale (20260926g). Opcional. */
  cuenta_origen_id?: number | null
}

/**
 * Cómo se piensa pagar con cheques / e-cheqs (20260923n): cuántos, la fecha
 * del primero y cada cuántos días los siguientes. No es plata: precarga el
 * Excel del Galicia y el modal de pago.
 */
export interface PagosPlanCheques {
  cantidad:     number
  primer_cobro: string
  cada_dias:    number
}

/** Cuánto de una NC se aplica a una factura. */
export interface PagosAplicaNcInput {
  factura_id: number
  monto:      number
}

export interface CrearFacturaInput {
  /** Default 'factura'. La NC no lleva orden, vencimiento, plan de cheques ni paga_cliente. */
  clase?:               PagosClaseComprobante
  /** Solo NC: a qué facturas acredita. Sin esto la NC queda como crédito a favor. */
  aplica_a?:            PagosAplicaNcInput[]
  proveedor_id:         number
  /** Obligatorio (400 `CONCEPTO_REQUERIDO`). */
  concepto_id:          number
  tipo_comprobante:     PagosTipoComprobante
  numero?:              string | null
  fecha:                string
  vence_el?:            string | null
  neto?:                number | null
  iva?:                 number | null
  percepciones?:        number | null
  otros?:               number | null
  /** Final, con IVA. */
  total:                number
  forma_pago_prevista?: PagosFormaPrevista
  descripcion:          string
  obs?:                 string
  paga_cliente?:        boolean
  /** Σ = `total − percepciones`, exacto (la última fila absorbe el redondeo). */
  imputaciones:         PagosImputacionInput[]
  orden?:               PagosOrdenAlCargarInput | null
  plan_cheques?:        PagosPlanCheques | null
  no_gravado?:          number | null
  exento?:              number | null
  cae?:                 string | null
  cae_vto?:             string | null
  cbte_tipo_arca?:      number | null
  /** Manda el detalle: reemplaza el guardado y la base deriva neto, IVA, percepciones y otros. */
  iva_detalle?:         PagosIvaDetalle[] | null
  tributos?:            Omit<PagosTributo, 'id'>[] | null
  /** La lectura del comprobante (POST /facturas/leer): el archivo se adjunta solo. */
  lectura_id?:          number | null
  /** `YYYY-MM-01`. Sin mandar (o null) la base pone el sugerido (20260927a). */
  periodo_iva?:         string | null
}

/**
 * PATCH estricto: una clave desconocida es 400. `imputaciones` reemplaza el
 * set entero y `motivo` es obligatorio si la factura ya tiene pagos.
 */
export interface EditarFacturaInput {
  proveedor_id?:        number
  /** Editable siempre (también pagada): es clasificación. No se puede vaciar. */
  concepto_id?:         number
  tipo_comprobante?:    PagosTipoComprobante
  numero?:              string | null
  fecha?:               string
  vence_el?:            string | null
  neto?:                number | null
  iva?:                 number | null
  percepciones?:        number | null
  otros?:               number | null
  total?:               number
  forma_pago_prevista?: PagosFormaPrevista
  descripcion?:         string
  obs?:                 string
  paga_cliente?:        boolean
  imputaciones?:        PagosImputacionInput[]
  motivo?:              string
  plan_cheques?:        PagosPlanCheques | null
  no_gravado?:          number | null
  exento?:              number | null
  cae?:                 string | null
  cae_vto?:             string | null
  cbte_tipo_arca?:      number | null
  /** Manda el detalle: reemplaza el guardado y la base deriva neto, IVA, percepciones y otros. */
  iva_detalle?:         PagosIvaDetalle[] | null
  tributos?:            Omit<PagosTributo, 'id'>[] | null
  /** Solo NC pendiente/observada: reemplaza las aplicaciones (`clase` no se edita). */
  aplica_a?:            PagosAplicaNcInput[]
  /** Clasificación fiscal (20260927a): editable siempre, no desaprueba. No admite null. */
  periodo_iva?:         string
}

export interface PagosLineaOrdenInput {
  /** La OP ya no acepta `nota_credito` (20260925): la NC es un comprobante. */
  tipo:        Exclude<PagosTipoLinea, 'nota_credito'>
  /** null solo en las líneas `a_cuenta`. */
  factura_id?: number | null
  monto:       number
  /** Obligatorios en las líneas `nota_credito`, prohibidos en las demás. */
  nc_numero?:  string | null
  nc_fecha?:   string | null
}

export interface CrearOrdenInput {
  proveedor_id: number
  fecha:        string
  fecha_cobro?: string | null
  /** null cuando la OP es solo notas de crédito: sin plata no hay forma de pago. */
  forma_pago?:  PagosFormaPagoOP | null
  referencia?:  string
  obs?:         string
  lineas:       PagosLineaOrdenInput[]
  adjuntos?:    PagosAdjuntoPendiente[]
  /**
   * Obligatorio con `cheque`/`echeq` y prohibido con el resto. La suma tiene
   * que dar exactamente lo que sale de plata, y `fecha_cobro` de la orden sale
   * del más próximo — no hace falta mandarla.
   */
  cheques?:     PagosChequeNuevo[]
  /** De qué cuenta de tesorería sale (20260926g). Opcional. */
  cuenta_origen_id?: number | null
}

/**
 * De una OP emitida solo se corrigen estos: lo financiero no se edita, se
 * anula. `cuenta_origen_id` es clasificación (20260926g), no plata.
 */
export interface EditarOrdenInput {
  referencia?: string
  obs?:        string
  cuenta_origen_id?: number | null
}

export interface CrearProveedorInput {
  razon_social:     string
  /** Se normaliza en el backend («30-57742861-8» → «30577428618») y valida el verificador. */
  cuit?:            string | null
  alias_cbu?:       string | null
  cbu?:             string | null
  banco?:           string
  plazo_pago_dias?: number
  vencimiento_modo?: 'dias' | 'cierre_mensual' | 'fin_mes_siguiente'
  cierre_dia?:      number | null
  forma_pago_habitual?: PagosFormaPrevista | null
  icl_computa_pago_a_cuenta?: boolean
  concepto_habitual_id?: number | null
  obra_habitual_cod?:    string | null
  contacto?:        string
  telefono?:        string
  email?:           string
  obs?:             string
  /** A mano o precargados desde «Buscar en ARCA» (20260925o). */
  domicilio?:        string | null
  provincia?:        string | null
  condicion_iva_id?: number | null
}

export type EditarProveedorInput = Partial<CrearProveedorInput>

/**
 * `GET /api/pagos/proveedores/padron/:cuit`: lo que dice ARCA, listo para
 * precargar. No guarda nada. Misma forma que Ventas (`VentasPadronResultado`),
 * pero el `padron` se tipa tolerante: domicilio plano o `domicilio_fiscal`,
 * actividades con `codigo` o `id`. Leerlo con los helpers de `pagos.utils`.
 */
export interface PagosPadronPersona {
  cuit?:                 string
  razon_social:          string
  domicilio?:            string | null
  provincia?:            string | null
  domicilio_fiscal?:     { direccion: string; localidad: string; cod_postal: string; provincia: string } | null
  condicion_iva_id:      number
  condicion_iva_motivo?: string | null
  condicion_iva_dudosa?: boolean
  tipo_persona?:         string | null
  actividades?:          { codigo?: number | string; id?: number; descripcion: string }[]
  estado_clave?:         string | null
}
export interface PagosPadronResultado {
  padron:         PagosPadronPersona
  precarga:       { razon_social: string; domicilio: string; provincia: string; condicion_iva_id: number }
  consultado_at?: string
}

/** `POST /api/pagos/proveedores/:id/actualizar-desde-arca[?todo=1]`. */
export interface PagosActualizarDesdeArcaRes {
  proveedor:   PagosProveedor
  diferencias: { campo: string; actual: unknown; arca: unknown; aplicado: boolean }[]
}

/** `POST /api/pagos/proveedores/actualizar-desde-arca` (todos los activos con CUIT). No pisa razón social. */
export interface PagosActualizarTodosArcaRes {
  /** Cantidad (o lista de ids, según el backend: leer con `cantidadDe`). */
  actualizados: number | unknown[]
  sin_cuit:     number | unknown[]
  errores:      { proveedor_id: number; razon_social: string; error: string }[]
}
/** La puerta del contador: solo datos de pago, ni razón social ni CUIT ni obs. */
export type PagosDatosPagoInput = Pick<CrearProveedorInput,
  'alias_cbu' | 'cbu' | 'banco' | 'plazo_pago_dias' | 'forma_pago_habitual' | 'contacto' | 'telefono' | 'email'>

// ── Respuestas de las mutaciones ──────────────────────────────────────

export interface CrearFacturaRes {
  factura: PagosFactura
  /** La OP que nació con la factura si se tildó «Ya está pagada». */
  orden:   PagosOrden | null
  avisos:  PagosAviso[]
}

export interface EditarFacturaRes {
  factura:              PagosFactura
  /** El cambio devolvió la factura a `pendiente`: hay que reaprobarla. */
  aprobacion_retirada?: boolean
  avisos:               PagosAviso[]
}

/**
 * Anular factura: normalmente devuelve la fila; si era «pagada al cargar»
 * devuelve `{ factura, orden }` porque anula las dos. `facturaAnulada()` de
 * `src/modules/pagos/utils/pagos.utils.ts` resuelve las dos formas.
 */
export type AnularFacturaRes = PagosFactura | { factura: PagosFactura; orden: PagosOrden | null }

export interface AprobarLoteRes {
  aprobadas: number[]
  /** Las que no se pudieron aprobar, con su código (`NO_PUEDE_APROBAR_PROPIA`, …). */
  omitidas:  { id: number; code: string; detail?: unknown }[]
}

/** POST /facturas/:id/aplicar-nc. */
export interface AplicarNcRes {
  nc:       PagosFactura
  facturas: PagosFactura[]
}

export interface RegistrarOrdenRes {
  orden:    PagosOrden
  /** Las facturas tocadas, ya recalculadas (`pagada_parcial` / `pagada`). */
  facturas: PagosFactura[]
  avisos:   PagosAviso[]
}

/**
 * «Pagar en lote» (20260929t, `POST /api/pagos/ordenes/lote`): N órdenes, una
 * por proveedor, todo o nada. Cada orden tiene la forma de `CrearOrdenInput`;
 * la fecha es la del lote y la cuenta de origen, si la orden no trae la suya.
 */
export interface CrearOrdenesLoteInput {
  fecha:             string
  cuenta_origen_id?: number | null
  ordenes:           Omit<CrearOrdenInput, 'fecha'>[]
}

export interface RegistrarOrdenesLoteRes {
  ordenes: { indice: number; proveedor_id: number; orden: PagosOrden; facturas: PagosFactura[] }[]
  /** Como en la OP suelta (COMPROBANTE_YA_USADO), con el bloque al que corresponde. */
  avisos:  (PagosAviso & { indice?: number; proveedor_id?: number })[]
}

export interface AnularOrdenRes {
  orden:    PagosOrden
  /** Vuelven a `aprobada`, o a `pendiente` si nadie las había aprobado. */
  facturas: PagosFactura[]
}

export interface ProveedorRes {
  proveedor: PagosProveedor
  avisos:    PagosAviso[]
}

/** Paso 1 del upload: el backend devuelve `storage_path` (NO `path`). */
export interface PagosUploadUrlRes {
  storage_path: string
  signed_url:   string
  token:        string
  tipo:         string
}

// ══════════════════════════════════════════════════════════════════════
// Facturación electrónica de venta contra ARCA (fase 1, 2026-09-24)
// Migraciones 20260924a/b/c. Contrato de la API: /api/facturacion.
// Módulo independiente como Pagos: padrón propio (`ventas_clientes`) y lo
// único compartido son las obras (`obras.cliente_id` y `obras.cc`).
// ══════════════════════════════════════════════════════════════════════

export type VentasAmbiente = 'homo' | 'prod'
export type VentasEstado =
  | 'borrador' | 'emitiendo' | 'autorizada' | 'rechazada' | 'error_reconciliar' | 'descartada'
/** 1/3 Factura y NC A, 6/8 Factura y NC B (fase 5), 201/203 FCE MiPyME A y su NC (fase 6). */
export type VentasCbteTipo = 1 | 3 | 6 | 8 | 201 | 203
/** Opción de transferencia de la FCE: Sistema de Circulación Abierta / Agente de Depósito Colectivo. */
export type VentasTransmisionFce = 'SCA' | 'ADC'
/**
 * Nombre de un producto de venta. Desde 20260929b es un catálogo editable
 * (Ventas › Configuración › Productos, `ProductoVenta` en config.types): la
 * factura guarda `producto_id` y este nombre como foto.
 */
export type VentasProducto = string
/** Ids de alícuota de ARCA: 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %. */
export type VentasAlicuotaId = 3 | 4 | 5 | 6 | 8 | 9
/** 80 CUIT, 86 CUIL, 96 DNI, 99 sin identificar. */
export type VentasDocTipo = 80 | 86 | 96 | 99

/** Lo que ARCA devuelve en Errors / Observaciones. El incierto guarda `{ error }`. */
export interface VentasMensajeArca {
  code?:  number | string
  msg?:   string
  error?: string
}

/** Fila de `ventas_clientes` + las obras que la apuntan. */
export interface VentasCliente {
  id:                number
  razon_social:      string
  doc_tipo:          VentasDocTipo
  doc_nro:           string
  condicion_iva_id:  number
  domicilio:         string
  provincia:         string
  email:             string
  activo:            boolean
  obs:               string
  created_at:        string
  updated_at:        string
  obras:             { cod: string; nom: string }[]
  /** Contactos (20260925e): nombre, rol, email, teléfono, recibe avisos. `email` suelto queda de antes. */
  contactos?:        import('./contactos').Contacto[]
  /** Cuenta de CADINC que el cliente quiere en la FCE (null = la de por defecto). Fase 6. */
  cuenta_fce_id?:     number | null
  /** Cache de WSFECRED (30 días): obligado a recibir FCE y desde qué monto. */
  fce_obligado?:      boolean | null
  fce_monto_desde?:   number | null
  fce_consultado_at?: string | null
  /** Último resultado del padrón de ARCA (fase 7). Solo lo escribe «Actualizar desde ARCA». */
  padron_json?:          VentasPadronPersona | null
  padron_consultado_at?: string | null
  /** Días para el vencimiento de cobro por defecto (0–365, default 30). 20260924k. */
  plazo_pago_dias?:      number
}

/** Una persona según el padrón de ARCA (getPersona_v2), resumida por el backend. */
export interface VentasPadronPersona {
  cuit:           string
  razon_social:   string
  tipo_persona:   string
  estado_clave:   string
  domicilio_fiscal: { direccion: string; localidad: string; cod_postal: string; provincia: string; id_provincia: number | null } | null
  /** Condición IVA DEDUCIDA de los impuestos inscriptos. */
  condicion_iva_id:     number
  /** true = la deducción no es segura: revisarla a mano. */
  condicion_iva_dudosa: boolean
  condicion_iva_motivo: string
  es_monotributo: boolean
  es_exento:      boolean
  categoria_monotributo: string | null
  impuestos:   { id: number; descripcion: string; estado: string; periodo: number | null }[]
  actividades: { id: number; descripcion: string; orden: number | null }[]
  avisos:      string[]
}

/** GET /clientes/padron/:cuit — lo que dice ARCA, listo para precargar. No guarda nada. */
export interface VentasPadronResultado {
  cuit:          string
  precarga:      { razon_social: string; domicilio: string; provincia: string; condicion_iva_id: number }
  padron:        VentasPadronPersona
  consultado_at: string
}

/** POST /clientes/:id/actualizar-desde-arca */
export interface VentasActualizarDesdeArca {
  cliente:     VentasCliente
  diferencias: { campo: string; actual: unknown; arca: unknown; aplicado: boolean }[]
  padron:      VentasPadronPersona
}

/** GET /clientes/:id/fce — ¿el cliente está obligado a recibir FCE MiPyME? */
export interface VentasInfoFce {
  cliente_id:    number
  cuit:          string
  obligado:      boolean | null
  monto_desde:   number | null
  consultado_at: string | null
  fuente:        'arca' | 'cache' | 'sin_datos' | 'no_aplica'
  minimo:        number
  error:         string | null
}

/** Cuenta bancaria de CADINC para la FCE (`ventas_cuentas_bancarias`). */
export interface VentasCuentaBancaria {
  id:         number
  banco:      string
  cbu:        string
  alias:      string
  es_default: boolean
  activo:     boolean
  obs:        string
  created_at: string
  updated_at: string
  clientes:   { id: number; razon_social: string }[]
}

export interface VentasCuentaInput {
  banco:       string
  cbu:         string
  alias?:      string
  es_default?: boolean
  obs?:        string
}

export interface VentasClienteInput {
  razon_social:     string
  doc_tipo:         VentasDocTipo
  doc_nro:          string
  condicion_iva_id: number
  domicilio?:       string
  provincia?:       string
  email?:           string
  obs?:             string
  cuenta_fce_id?:   number | null
  /** Días para el vencimiento de cobro (0–365). 20260924k. */
  plazo_pago_dias?: number
}

export interface VentasCondicionIva {
  id:          number
  descripcion: string
  admite_a:    boolean
  /** Desde la fase 5 (backend 2026-09-23). Opcional por si el backend es viejo. */
  admite_b?:   boolean
}

/**
 * Obra facturable (GET /api/facturacion/obras): cada obra es su propio centro
 * de costo (23/09). Vienen solo las no archivadas, ni internas ni depósito.
 */
export interface VentasObra {
  cod:         string
  nom:         string
  cliente_id:  number | null
  /** Razón social del cliente que agrupa la obra (`ventas_clientes`). */
  cliente_nom: string | null
  es_interna:  boolean
  archivada:   boolean
}

export interface VentasArcaEstado {
  ambiente:   VentasAmbiente | null
  configurado: boolean
  falta:      string[]
  pto_vta:    number
  dummy:      { appServer: string; dbServer: string; authServer: string } | null
  ultimo:     Record<string, number> | null
  error:      string | null
  /** 20260929d (ausentes contra un backend viejo). Último autorizado por PV activo. */
  ultimo_por_pv?: Record<string, Record<string, number>> | null
  puntos_venta?:  ArcaAmbienteInfo['puntos_venta']
  certificado?:   CertificadoArca | null
  certificado_error?: string | null
}

/** Fila de `v_ventas_facturas`. Los numeric llegan como number (a veces string: usar Number()). */
export interface VentasFactura {
  id:                   number
  ambiente:             VentasAmbiente
  pto_vta:              number
  cbte_tipo:            VentasCbteTipo
  numero:               number | null
  numero_intentado:     number | null
  estado:               VentasEstado
  concepto:             1 | 2 | 3
  fecha_cbte:           string
  fch_vto_pago:         string | null
  cliente_id:           number
  rec_razon_social:     string
  rec_doc_tipo:         VentasDocTipo
  rec_doc_nro:          string
  rec_condicion_iva_id: number
  rec_domicilio:        string
  obra_cod:             string | null
  producto:             VentasProducto
  /** Catálogo de productos (20260929b). Ausente contra un backend viejo. */
  producto_id?:         number | null
  /** Período de servicio (concepto 2/3, 20260929b). null = el día de la factura. */
  fch_serv_desde?:      string | null
  fch_serv_hasta?:      string | null
  /**
   * Foto «COD — Nombre» de la obra que guarda la base al guardar (20260924h).
   * No se manda: la deriva la RPC. En las viejas de homologación es el `cc`.
   */
  centro_costo:         string | null
  provincia_origen:     string
  provincia_destino:    string
  condicion_pago:       string
  remitos:              string
  observaciones:        string
  moneda:               string
  cotizacion:           number
  imp_neto:             number
  imp_iva:              number
  imp_trib:             number
  imp_op_ex:            number
  imp_tot_conc:         number
  imp_total:            number
  cae:                  string | null
  cae_vto:              string | null
  resultado:            'A' | 'R' | 'P' | null
  observaciones_arca:   VentasMensajeArca[] | null
  errores_arca:         VentasMensajeArca[] | null
  intento_at:           string | null
  intento_n:            number
  emitida_por:          string | null
  emitida_at:           string | null
  numero_finnegans:     string | null
  registrada_at:        string | null
  registrada_por:       string | null
  obs_interna:          string
  created_at:           string
  updated_at:           string
  created_by:           string | null
  updated_by:           string | null
  // derivadas de la vista
  letra:                'A' | 'B'
  tipo_nombre:          string
  cod_cbte:             string
  es_nc:                boolean
  numero_fmt:           string | null
  numero_intentado_fmt: string | null
  es_homologacion:      boolean
  pendiente_finnegans:  boolean
  mes:                  string
  cliente_razon_social: string
  cliente_activo:       boolean
  cliente_email:        string
  obra_nom:             string | null
  created_by_nombre:    string | null
  emitida_por_nombre:   string | null
  registrada_por_nombre: string | null
  nc_autorizadas:       number
  /** Solo facturas autorizadas: total − NC autorizadas. null en NC y no autorizadas. */
  saldo_nc:             number | null
  asociada_id:          number | null
  asociada_numero_fmt:  string | null
  asociada_cbte_tipo:   VentasCbteTipo | null
  /** Solo en GET /facturas (fase 5): las descripciones de los renglones, en orden. */
  descripciones?:       string[]
  // FCE MiPyME (fase 6, 20260924e/f). Foto de la cuenta al guardar.
  fce_cuenta_id?:       number | null
  fce_cbu?:             string | null
  fce_alias?:           string | null
  fce_banco?:           string | null
  fce_transmision?:     VentasTransmisionFce | null
  /** Referencia comercial (opcional 23), p. ej. la OC del cliente. */
  fce_referencia?:      string | null
  /** NC FCE: opcional 22 (S = anula por rechazo del comprador). */
  nc_anulacion?:        'S' | 'N' | null
  es_fce?:              boolean
  asociada_fecha_cbte?: string | null
  // Cobranzas (20260924m). Solo autorizadas; en una NC, cobro_saldo = crédito libre.
  /** Vencimiento de COBRO (no fiscal). Automático = fecha + plazo del cliente; FCE = fch_vto_pago. */
  vence_el?:            string | null
  /** true = lo fijó alguien a mano y ya no se recalcula. */
  vence_el_manual?:     boolean
  cobro_saldo?:         number | null
  cobro_aplicado?:      number | null
  cobro_estado?:        VentasCobroEstadoDeuda | VentasCreditoEstado | null
  cobro_dias_vencido?:  number | null
}

export interface VentasRenglon {
  id:           number
  orden:        number
  descripcion:  string
  cantidad:     number
  unidad:       string
  precio_unit:  number
  alicuota_id:  VentasAlicuotaId
  tasa:         number
  importe_neto: number
}

export interface VentasAlicuota {
  alicuota_id: VentasAlicuotaId
  tasa:        number
  base_imp:    number
  importe:     number
}

export interface VentasAsociado {
  asociada_id: number
  cbte_tipo:   VentasCbteTipo
  pto_vta:     number
  numero:      number
  cuit:        string
  fecha_cbte:  string
}

export interface VentasEvento {
  id:             number
  tipo:           string
  estado_antes:   VentasEstado | null
  estado_despues: VentasEstado | null
  detalle:        Record<string, unknown>
  user_id:        string | null
  user_nombre:    string | null
  created_at:     string
}

/** Forma FJ que devuelven las RPC y los endpoints de una factura. */
export interface VentasFacturaFJ {
  factura:   VentasFactura
  renglones: VentasRenglon[]
  alicuotas: VentasAlicuota[]
  asociados: VentasAsociado[]
}

export interface VentasFacturaDetalle extends VentasFacturaFJ {
  eventos: VentasEvento[]
}

export interface VentasFacturasPage {
  rows:  VentasFactura[]
  total: number
}

export interface VentasResumenFila {
  mes:          string
  /** La obra es el centro de costo. null = sin obra (transporte). */
  obra_cod:     string | null
  obra_nom:     string | null
  producto:     VentasProducto
  letra:        'A' | 'B'
  cantidad:     number
  neto:         number
  iva:          number
  total:        number
}

export interface VentasRenglonInput {
  descripcion: string
  cantidad:    number
  unidad?:     string
  precio_unit: number
  alicuota_id: VentasAlicuotaId
}

export interface VentasFacturaInput {
  factura: {
    /** Lo calcula el sistema desde el cliente (y la asociada en una NC); el backend lo vuelve a derivar. */
    cbte_tipo:          VentasCbteTipo
    cliente_id:         number
    /** Foto del nombre; manda `producto_id` (el backend viejo solo lee el nombre). */
    producto:           VentasProducto
    producto_id?:       number | null
    /** 20260929d: sin él, el backend usa el que ya tenía el borrador o el por defecto. */
    pto_vta?:           number | null
    /** Período de servicio (20260929b): los dos o ninguno. */
    fch_serv_desde?:    string | null
    fch_serv_hasta?:    string | null
    /** La obra es el centro de costo: obligatoria si el producto la pide. */
    obra_cod?:          string | null
    fecha_cbte?:        string
    provincia_origen?:  string
    provincia_destino?: string
    condicion_pago?:    string
    remitos?:           string
    observaciones?:     string
    obs_interna?:       string
    asociada_id?:       number | null
    // FCE (fase 6): solo cuentan en la 201 / 203.
    fce_cuenta_id?:     number | null
    fch_vto_pago?:      string | null
    fce_transmision?:   VentasTransmisionFce | null
    fce_referencia?:    string | null
    nc_anulacion?:      'S' | 'N' | null
  }
  renglones: VentasRenglonInput[]
  forzar?:   boolean
}

/** POST /emitir: 200 = FJ autorizada; 202 = incierta (la factura quedó error_reconciliar). */
export type VentasEmitirRes =
  | VentasFacturaFJ
  | { error: 'EMISION_INCIERTA'; factura: VentasFacturaFJ; detail?: { numero_intentado?: number; mensaje?: string } }

// ══════════════════════════════════════════════════════════════════════
// Ventas › Cobranzas, deudores y saldos iniciales (2026-09-24)
// Migraciones 20260924k…o. Contrato: /api/facturacion/{cobros,compensaciones,
// imputaciones,deudores,externos,clientes/:id/pendientes|estado-cuenta}.
// Los numeric llegan como number o string: siempre pasar por Number().
// ══════════════════════════════════════════════════════════════════════

/** Débito: 'pagada' | 'parcial' | 'pendiente' (+ 'vencida' en v_ventas_facturas). */
export type VentasCobroEstadoDeuda = 'pagada' | 'parcial' | 'pendiente' | 'vencida'
/** Crédito (NC libre, cobro a cuenta): 'usado' | 'parcial' | 'disponible'. */
export type VentasCreditoEstado = 'usado' | 'parcial' | 'disponible'

export type VentasCobroForma = 'transferencia' | 'cheque' | 'echeq' | 'efectivo' | 'otro'
/**
 * Clave de `ventas_retencion_tipos` (20260929g): catálogo editable desde
 * Ventas › Configuración. Los de la semilla son 'iibb' | 'tem' | 'suss' |
 * 'ganancias' | 'iva' | 'otra'.
 */
export type VentasRetencionTipo = string
/** Códigos de ARCA que admite un comprobante externo. */
export type VentasCbteTipoExterno = 1 | 2 | 3 | 6 | 7 | 8 | 60 | 61 | 201 | 202 | 203

/** Fila de `ventas_saldos_al` / `v_ventas_saldos` / `v_ventas_creditos`: LA fuente del saldo. */
export interface VentasSaldo {
  origen:          'erp' | 'externo' | 'cobro'
  naturaleza:      'debito' | 'credito'
  factura_id:      number | null
  externo_id:      number | null
  cobro_id:        number | null
  ambiente:        VentasAmbiente
  cliente_id:      number
  cbte_tipo:       number | null
  tipo:            'FC' | 'ND' | 'NC' | 'RC'
  letra:           'A' | 'B' | null
  pto_vta:         number
  numero:          number
  /** 'FA', 'FCE A', 'NCA', 'CVLP A', 'RC'… */
  tipo_abrev:      string
  /** '00004-00000001' | 'RC 0001-00000001' */
  numero_fmt:      string
  /** 'FA 00004-00000001' | 'RC 0001-00000001' */
  comprobante:     string
  fecha:           string
  vence_el:        string
  total:           number
  saldo_inicial:   number
  nc_aplicadas:    number
  cobrado:         number
  compensado:      number
  aplicado:        number
  saldo:           number
  saldo_a_revisar: boolean
  estado:          VentasCobroEstadoDeuda | VentasCreditoEstado
  dias_vencido:    number
  cliente_razon_social?: string
  cliente_doc_nro?:      string
}

/** Retenciones por tipo en la lista de cobros (`retenciones_resumen`). */
export interface VentasRetencionResumen {
  tipo:    VentasRetencionTipo
  importe: number
}

/** Fila de `v_ventas_cobros` (el recibo, RC 0001-NNNNNNNN). */
export interface VentasCobro {
  id:                    number
  ambiente:              VentasAmbiente
  numero:                number
  numero_fmt:            string
  fecha:                 string
  cliente_id:            number
  cliente_razon_social:  string
  cliente_doc_nro:       string
  total_medios:          number
  total_retenciones:     number
  total:                 number
  aplicado:              number
  a_cuenta:              number
  estado:                'vigente' | 'anulado'
  anulado_motivo:        string | null
  anulado_por:           string | null
  anulado_por_nombre:    string | null
  anulado_el:            string | null
  obs:                   string
  created_at:            string
  updated_at:            string
  created_by:            string | null
  created_by_nombre:     string | null
  updated_by:            string | null
  es_homologacion:       boolean
  cantidad_imputaciones: number
  cantidad_medios:       number
  medios_formas:         VentasCobroForma[]
  cantidad_retenciones:  number
  retenciones_resumen:   VentasRetencionResumen[]
  /** 20260930k: gastos que el cliente descontó al pagar (total = medios + retenciones + gastos). */
  total_gastos?:         number
  /** 20260930k: número de la liquidación del cliente con que se cargó (único por cliente entre vigentes). */
  liquidacion_numero?:   string | null
  cantidad_gastos?:      number
}

export interface VentasCobrosPage {
  rows:  VentasCobro[]
  total: number
}

/** Fila de `ventas_cobro_medios` + los datos de la cuenta de CADINC. */
export interface VentasCobroMedio {
  id:                 number
  cobro_id:           number
  orden:              number
  forma:              VentasCobroForma
  importe:            number
  cuenta_bancaria_id: number | null
  cheque_numero:      string | null
  cheque_banco:       string | null
  cheque_librador:    string | null
  cheque_fecha_cobro: string | null
  /** 20260930k: 11 dígitos. */
  cheque_librador_cuit?: string | null
  obs:                string
  cuenta_banco?:      string | null
  cuenta_alias?:      string | null
  cuenta_cbu?:        string | null
}

/** Fila de `ventas_cobro_retenciones`. */
export interface VentasCobroRetencion {
  id:                 number
  cobro_id:           number
  orden:              number
  tipo:               VentasRetencionTipo
  jurisdiccion:       string
  /** 20260929f: jurisdicción del catálogo (null = sin jurisdicción o texto viejo sin resolver). */
  jurisdiccion_id?:   number | null
  certificado_numero: string
  fecha:              string
  importe:            number
  adjunto_path:       string | null
  adjunto_nombre:     string | null
  adjunto_hash:       string | null
  adjunto_mime:       string | null
  adjunto_size:       number | null
  obs:                string
}

/** Fila de `ventas_cobro_gastos` (20260930k) + el nombre del concepto. */
export interface VentasCobroGasto {
  id:              number
  cobro_id:        number
  orden:           number
  concepto_id:     number
  concepto_nombre: string
  importe:         number
  obs:             string
}

/** Concepto de gasto descontado (Ventas › Configuración, `ventas_cobro_gasto_conceptos`). */
export interface VentasGastoConcepto {
  id:      number
  nombre:  string
  /** Sinónimos en minúsculas sin acentos (con ellos se reconocen los renglones de una liquidación). */
  alias:   string[]
  activo:  boolean
  orden:   number
  /** Renglones cargados con este concepto. */
  gastos:  number
  /** ¿Tiene cuenta en Contabilidad › Mapeos (cobros.gasto)? */
  mapeado: boolean
}

export interface VentasGastoConceptoInput {
  nombre?: string
  alias?:  string[]
  activo?: boolean
  orden?:  number
}

/** Fila de `v_ventas_imputaciones`. */
export interface VentasImputacion {
  id:                   number
  cobro_id:             number | null
  nc_factura_id:        number | null
  nc_externo_id:        number | null
  factura_id:           number | null
  externo_id:           number | null
  importe:              number
  fecha:                string
  anulada:              boolean
  anulada_por:          string | null
  anulada_el:           string | null
  anulada_motivo:       string | null
  created_at:           string
  created_by:           string | null
  created_by_nombre:    string | null
  anulada_por_nombre:   string | null
  origen_tipo:          'cobro' | 'nc' | 'nc_externa'
  origen_fmt:           string
  destino_tipo:         'factura' | 'externo'
  cliente_id:           number
  ambiente:             VentasAmbiente
  destino_fmt:          string
  destino_fecha:        string
  destino_vence_el:     string
  destino_total:        number
  destino_saldo_actual: number | null
}

/** GET /cobros/:id y la respuesta de POST /cobros. */
export interface VentasCobroDetalle {
  cobro:        VentasCobro
  medios:       VentasCobroMedio[]
  retenciones:  VentasCobroRetencion[]
  /** 20260930k (puede faltar en respuestas viejas). */
  gastos?:      VentasCobroGasto[]
  imputaciones: VentasImputacion[]
  /** Documentación del cliente (20260924q). */
  adjuntos?:    VentasCobroAdjunto[]
  /** Solo en el POST /cobros: adjuntos que no se registraron (el cobro quedó igual). */
  adjuntos_error?: VentasCobroAdjuntoError[]
}

/** Qué papel del cliente es: comprobante de la transferencia/depósito, su orden de pago u otro. */
export type VentasCobroAdjuntoTipo = 'comprobante_pago' | 'orden_pago' | 'liquidacion' | 'otro'

/** Fila de `ventas_cobro_adjuntos` (bucket privado ventas-docs, cobros/<id>/). */
export interface VentasCobroAdjunto {
  id:             number
  cobro_id:       number
  tipo:           VentasCobroAdjuntoTipo
  storage_path:   string
  nombre_archivo: string
  mime:           string | null
  size_bytes:     number | null
  file_hash:      string
  obs:            string
  created_at:     string
  created_by:     string | null
}

/** Lo que viaja en `adjuntos` del POST /cobros y en POST /cobros/:id/adjuntos. */
export interface VentasCobroAdjuntoInput {
  tipo:           VentasCobroAdjuntoTipo
  storage_path:   string
  nombre_archivo: string
  mime?:          string | null
  obs?:           string | null
}

export interface VentasCobroAdjuntoError {
  indice:         number
  nombre_archivo: string
  error:          string
  detail?:        unknown
}

/** Destino de una imputación: una factura del ERP o un comprobante externo. */
export type VentasDestinoImputacion =
  | { factura_id: number; importe: number }
  | { externo_id: number; importe: number }

export interface VentasCobroMedioInput {
  forma:               VentasCobroForma
  importe:             number
  cuenta_bancaria_id?: number | null
  cheque_numero?:      string
  cheque_banco?:       string
  cheque_librador?:    string
  cheque_fecha_cobro?: string | null
  cheque_librador_cuit?: string | null
  obs?:                string
}

export interface VentasCobroGastoInput {
  concepto_id: number
  importe:     number
  obs?:        string
}

export interface VentasCobroRetencionInput {
  tipo:                VentasRetencionTipo
  jurisdiccion?:       string
  /** 20260929f: con id, la base pisa el texto con el nombre del catálogo. */
  jurisdiccion_id?:    number | null
  certificado_numero?: string
  fecha?:              string
  importe:             number
  /** storage_path que devolvió upload-url. El sha256 lo calcula el backend. */
  adjunto_path?:       string | null
  adjunto_nombre?:     string | null
  adjunto_mime?:       string | null
  adjunto_size?:       number | null
  obs?:                string
}

/** POST /cobros */
export interface VentasCobroInput {
  cobro:        { fecha: string; cliente_id: number; obs?: string; ambiente?: VentasAmbiente; liquidacion_numero?: string | null }
  medios:       VentasCobroMedioInput[]
  retenciones:  VentasCobroRetencionInput[]
  /** 20260930k: gastos que el cliente descontó. */
  gastos?:      VentasCobroGastoInput[]
  imputaciones: VentasDestinoImputacion[]
  adjuntos?:    VentasCobroAdjuntoInput[]
}

// ── Cargar liquidación (POST /cobros/liquidacion/leer, 20260930k) ──

export type VentasLiqAvisoComprobante = 'NO_ENCONTRADO' | 'YA_COBRADO' | 'SALDO_MENOR' | 'IMPORTE_DISTINTO'
export type VentasLiqAvisoCheque = 'YA_EN_OTRO_COBRO' | 'EN_CARTERA' | 'SIN_FECHA' | 'LIBRADOR_DESCONOCIDO'

export interface VentasLiquidacionPropuesta {
  fuente: 'texto' | 'ia'
  modelo: string | null
  liquidacion: {
    numero: string; fecha: string | null; emisor_nombre: string | null; emisor_cuit: string | null
    subtotal: number | null; neto: number | null; avisos: string[]
  }
  cliente:    { id: number; razon_social: string; doc_nro: string | null }
  ya_cargada: { cobro_id: number; numero_fmt: string | null } | null
  comprobantes: Array<{
    pto_vta: number; numero: number; numero_fmt: string; fecha: string | null
    bruto: number; comision: number; subtotal: number
    destino: { tipo: 'externo' | 'factura'; id: number; comprobante: string; fecha: string | null; total: number; saldo: number } | null
    imputar: number
    avisos: VentasLiqAvisoComprobante[]
  }>
  gastos: Array<{
    texto: string; codigo: string | null; comprobante: string | null; fecha: string | null; importe: number
    concepto_id: number | null; reconocido_por: string | null
  }>
  cheques: Array<{
    tipo: string; numero: string; banco: string; fecha_cobro: string | null; importe: number; propio: boolean
    librador: string | null; librador_cuit: string | null; avisos: VentasLiqAvisoCheque[]; cobro_existente_id: number | null
  }>
  controles: {
    suma_comprobantes: number; suma_deducciones: number; suma_cheques: number
    cierra_subtotal: boolean; cierra_neto: boolean; cierra_cheques: boolean; ok: boolean
  }
  total_cobro:   number
  total_imputar: number
  obs_sugerida:  string
  adjunto: { storage_path: string; nombre_archivo: string; mime: string; size: number; hash: string }
}

// ── «Soltá acá los comprobantes del cobro» (POST /cobros/comprobantes/leer, 2026-09-25) ──

export interface VentasAvisoLectura { severidad: 'error' | 'advertencia' | 'info'; codigo: string; mensaje: string }

/**
 * Lo que la IA leyó de UN comprobante del cobro (foto de cheque, e-cheq,
 * transferencia, depósito u orden de pago del cliente). No crea nada.
 */
export interface VentasComprobanteCobroLectura {
  tipo_documento: 'cheque' | 'echeq' | 'transferencia' | 'deposito' | 'orden_pago' | 'otro'
  fecha:          string | null
  pagador_nombre: string | null
  pagador_cuit:   string | null
  /** Reconocido por el CUIT o el nombre del pagador (o del librador); null = elegirlo a mano. */
  cliente:        { id: number; razon_social: string; por: 'cuit' | 'nombre' } | null
  medios: Array<{
    forma:       'cheque' | 'echeq' | 'transferencia' | 'efectivo'
    importe:     number | null
    numero:      string | null
    banco:       string | null
    fecha_cobro: string | null
    librador:    string | null
    librador_cuit: string | null
    /** Transferencia: la cuenta de CADINC reconocida (ventas_cuentas_bancarias). */
    cuenta_bancaria_id: number | null
    cuenta_texto: string | null
    avisos:      VentasAvisoLectura[]
    /** Cheque que ya es medio de un cobro vigente: no entra. */
    cobro_existente_id: number | null
  }>
  retenciones: Array<{
    tipo: 'iibb' | 'ganancias' | 'suss' | 'iva' | 'tem' | 'otra'
    jurisdiccion: string | null; certificado_numero: string | null; fecha: string | null; importe: number
  }>
  /** Las facturas/ND que la orden de pago dice que paga. */
  comprobantes: Array<{ tipo: string | null; pto_vta: number; numero: number; importe: number | null }>
  total:   number | null
  avisos:  VentasAvisoLectura[]
  modelo:  string | null
  adjunto: { storage_path: string; nombre_archivo: string; mime: string; size: number; hash: string }
}

/** POST /compensaciones: una NC (del ERP o externa) contra débitos del mismo cliente. */
export interface VentasCompensacionInput {
  nc:     { factura_id: number } | { externo_id: number }
  items:  VentasDestinoImputacion[]
  fecha?: string
}

/** POST /cobros/retenciones/upload-url */
export interface VentasUploadUrlRes {
  storage_path:    string
  signed_url:      string
  token?:          string
  nombre_archivo?: string
}

/** Fila de `ventas_deudores_antiguedad_al` (GET /api/facturacion/deudores). */
export interface VentasDeudor {
  ambiente:              VentasAmbiente
  cliente_id:            number
  cliente_razon_social:  string
  cliente_doc_nro:       string
  saldo:                 number
  a_cuenta:              number
  nc_disponible:         number
  saldo_neto:            number
  /** Antigüedad en días desde la FECHA de la factura (no el vencimiento). */
  d0_30:                 number
  d31_60:                number
  d61_90:                number
  d90_mas:               number
  saldo_a_revisar:       number
  comprobantes:          number
  ultima_cobranza:       string | null
  ultima_cobranza_total: number | null
}

export type VentasMovimientoTipo =
  | 'saldo_anterior' | 'factura' | 'nota_debito' | 'nota_credito' | 'externo' | 'externo_nc' | 'cobro' | 'retencion' | 'gasto'

/** Fila de `ventas_estado_cuenta`: debe − haber con saldo corrido. */
export interface VentasEstadoCuentaMov {
  orden:        number
  fecha:        string | null
  movimiento:   VentasMovimientoTipo
  comprobante:  string | null
  detalle:      string | null
  vence_el:     string | null
  debe:         number
  haber:        number
  saldo:        number
  factura_id:   number | null
  externo_id:   number | null
  cobro_id:     number | null
  retencion_id: number | null
}

/** GET /clientes/:id/estado-cuenta (normalizado por el hook). */
export interface VentasEstadoCuenta {
  cliente:         VentasCliente | null
  desde:           string | null
  hasta:           string | null
  movimientos:     VentasEstadoCuentaMov[]
  saldo_anterior?: number | null
  /** Coincide con el saldo corrido de la última fila y con el `saldo_neto` de Deudores. */
  saldo_final?:    number | null
  totales?:        { debe: number; haber: number } | null
}

/** GET /clientes/:id/pendientes */
export interface VentasPendientesCliente {
  cliente?:  VentasCliente | null
  ambiente?: VentasAmbiente
  al?:       string | null
  /** Facturas y externos con saldo, más viejo primero. */
  debitos:   VentasSaldo[]
  /** NC libres (ERP y externas) y cobros con saldo a cuenta. */
  creditos:  VentasSaldo[]
  totales?:  { debitos: number; creditos: number; a_cuenta: number; nc_disponible: number }
}

/** Fila de `v_ventas_externos` (saldos iniciales + libro de ventas jul–sep 2026). */
export interface VentasExterno {
  id:                    number
  cliente_id:            number
  cbte_tipo:             VentasCbteTipoExterno
  tipo:                  'FC' | 'ND' | 'NC'
  letra:                 'A' | 'B'
  pto_vta:               number
  numero:                number
  fecha:                 string
  vence_el:              string
  neto:                  number
  no_gravado:            number
  exento:                number
  iva:                   number
  total:                 number
  moneda:                string
  tipo_cambio:           number
  rec_doc_tipo:          number | null
  rec_doc_nro:           string | null
  rec_razon_social:      string | null
  saldo_inicial:         number
  saldo_a_revisar:       boolean
  saldo_confirmado_por:  string | null
  saldo_confirmado_el:   string | null
  saldo_motivo:          string
  saldo_cobrado_el:      string | null
  /**
   * Solo CVLP (060/061, 20260927d): lo que liquidó el comisionista (Casilda)
   * después de su comisión. El asiento automático va por este neto.
   */
  liquido?:              number | null
  origen:                'finnegans' | 'portal' | 'otro'
  obs:                   string
  created_at:            string
  updated_at:            string
  tipo_abrev:            string
  tipo_nombre:           string
  numero_fmt:            string
  comprobante:           string
  cliente_razon_social:  string
  cliente_doc_nro:       string
  saldo_confirmado_por_nombre: string | null
  aplicado:              number
  saldo:                 number
  estado:                VentasCobroEstadoDeuda | VentasCreditoEstado | null
  dias_vencido:          number | null
  cantidad_imputaciones: number
}

export interface VentasExternosPage {
  rows:  VentasExterno[]
  total: number
}

/** POST / PATCH /externos */
export interface VentasExternoInput {
  cliente_id:     number
  cbte_tipo:      VentasCbteTipoExterno
  pto_vta:        number
  numero:         number
  fecha:          string
  /** Opcional: sin él, el backend pone fecha + plazo del cliente. */
  vence_el?:      string
  total:          number
  saldo_inicial:  number
  neto?:          number
  iva?:           number
  origen?:        'finnegans' | 'portal' | 'otro'
  obs?:           string
}

/** Acciones masivas sobre saldos iniciales (`ventas_externos_marcar`). */
export type VentasExternoAccion = 'cobrada' | 'impaga' | 'revisar'

/** Una fila del Excel de ARCA lista para `ventas_importar_externos`. */
export interface VentasImportarFilaInput {
  cbte_tipo:        number
  pto_vta:          number
  numero:           number
  /** YYYY-MM-DD */
  fecha:            string
  rec_doc_tipo:     number | string
  rec_doc_nro:      string
  rec_razon_social: string
  neto:             number
  no_gravado:       number
  exento:           number
  iva:              number
  total:            number
  moneda:           string
  tipo_cambio:      number
  saldo?:           number
  vence_el?:        string
  obs?:             string
}

export interface VentasImportarFilaRes {
  indice:           number
  estado:           'nueva' | 'duplicada' | 'error'
  error:            string | null
  detalle:          Record<string, unknown> | null
  cbte_tipo:        number | null
  pto_vta:          number | null
  numero:           number | null
  fecha:            string | null
  vence_el:         string | null
  total:            number | null
  cliente_id:       number | null
  cliente_nuevo:    boolean
  rec_doc_nro:      string | null
  rec_razon_social: string | null
  saldo_inicial:    number | null
  saldo_a_revisar:  boolean | null
  saldo_motivo:     string | null
  externo_id:       number | null
}

export interface VentasImportarClienteNuevo {
  cliente_id:            number | null
  razon_social:          string
  doc_tipo:              number
  doc_nro:               string
  condicion_iva_id:      number
  revisar_condicion_iva: boolean
}

/** POST /externos/importar (vista previa con confirmar:false; alta con confirmar:true). */
export interface VentasImportarRes {
  confirmado:      boolean
  total_filas:     number
  nuevas:          number
  duplicadas:      number
  errores:         number
  a_revisar:       number
  clientes_nuevos: VentasImportarClienteNuevo[]
  filas:           VentasImportarFilaRes[]
}
