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
  cc: string | null
  dir: string | null
  resp: string | null
  obs: string | null
  archivada: boolean
  fecha_archivo: string | null
  es_deposito: boolean
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
}

export interface UpdateObraDto {
  nom?: string
  cc?: string
  dir?: string
  resp?: string
  obs?: string
  capataz_user_id?:   string | null
  jefe_obra_user_id?: string | null
}

// ── Personal ──
export interface CatHistorial {
  cat_id: number
  desde: string
}

export type PersonalModalidad = 'hora' | 'mes'

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
  personal_cat_historial: CatHistorial[]
}

export interface CreatePersonalDto {
  leg: string
  nom: string
  dni?: string
  condicion?: 'blanco' | 'asegurado'
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

// ── Adjuntos del cobro (liquidación líquido producto / factura emitida + comprobante) ──
export type CobroAdjuntoTipo = 'liquidacion' | 'comprobante' | 'factura'

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
}

// ── Tarifas ──
export interface Tarifa extends AuditFields {
  id: number
  obra_cod: string
  cat_id: number
  vh: number
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
  obs: string | null
}

// ── Certificaciones ──
export type CertEstado = 'pendiente' | 'cerrado'

export interface Certificacion extends AuditFields {
  id: number
  obra_cod: string
  contrat_id: number
  sem_key: string
  monto: number
  desc: string
  estado: CertEstado
}

export type ChoferEstado = 'activo' | 'descanso' | 'inactivo'
export type CamionEstado = 'activo' | 'mantenimiento' | 'inactivo'
export type ViajeEstado  = 'en_curso' | 'completado'
export type LiqEstado    = 'borrador' | 'cerrada'

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

// ── Bateas (remolques) ──
export type BateaTipo = 'volcadora' | 'plana' | 'tanque' | 'gondola' | 'otro'
export type BateaEstado = 'activo' | 'mantenimiento' | 'inactivo'
// Categoría de remolque (aparte de `tipo`, que describe la forma).
export type BateaCategoria = 'batea' | 'acoplado' | 'semirremolque'

export interface Batea extends AuditFields {
  id:           number
  patente:      string
  tipo:         BateaTipo | null
  categoria:    BateaCategoria
  marca:        string | null
  modelo:       string | null
  anio:         number | null
  capacidad_m3: number | null
  capacidad_tn: number | null
  titular:      string | null
  estado:       BateaEstado
  obs:          string | null
}

// ── Documentos del vehículo (camión y batea, mismo schema) ──
export type VehiculoDocTipo = 'titulo' | 'tarjeta_verde' | 'rto' | 'poliza_seguro' | 'homologacion' | 'registro_modificacion'
export type VehiculoEntidad = 'camion' | 'batea'

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
  chofer_id:   number
  camion_id:   number
  tipo:        TramoTipo
  estado:      TramoEstado
  empresa_id:  number | null
  cantera_id:  number | null   // origen en cargado, destino en vacio
  deposito_id: number | null   // destino en cargado, origen en vacio

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
  total_neto: number
  estado: LiqEstado
  obs: string | null
  created_at: string
}

export interface Adelanto {
  id: number
  chofer_id: number
  fecha: string
  monto: number
  descripcion: string | null
  forma_pago: 'transferencia' | 'efectivo'
  liquidacion_id: number | null
  comprobante_url:  string | null
  comprobante_hash: string | null
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
}

export interface TarifaEmpresaCantera {
  id: number
  empresa_id: number
  cantera_id: number
  deposito_id: number | null   // null = tarifa general; set = específica para descargas en ese depósito
  tipo_unidad: 'batea' | 'chasis' | null  // null = cualquier unidad; set = según el camión del viaje
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
  // Factura emitida por CADINC — solo en cobros de empresas con
  // modalidad_cobro='facturacion' (una factura por viaje).
  factura_nro: string | null
  factura_fecha: string | null
  created_at: string
  updated_at?: string | null
  empresas_transportistas?: { nombre: string; modalidad_cobro?: EmpresaModalidadCobro }
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
  //
  // Flags eliminadas en Permisos v3 (2026-05-18):
  // - vista_completa: reemplazada por `obras_scope` global del profile.
  // - solo_carga_horas: cubierta por tabs=['tarja'] + obras_scope='asignadas'.
  ver_costos?:             boolean
  ver_pii?:                boolean
  resolver_items?:         boolean
  forzar_despacho?:        boolean
  administrar_obras?:      boolean
  aprobar_ajustes_stock?:  boolean
}
export type Permisos = Record<string, ModuloPermisos>

export interface Profile {
  id:       string
  nombre:   string
  rol:      'admin' | 'operador'
  modulos:  string[]
  activo:   boolean
  permisos: Permisos
  // Sistema de roles v2 — ver `src/lib/permisos/plantillas.ts`.
  rol_base?:    'administrativo' | 'compras' | 'deposito' | 'jefe_obra' | 'capataz' | null
  obras_scope?: 'todas' | 'asignadas'
  // Legacy (back-compat). Antes era el "tipo" del usuario; ahora se deriva
  // de rol_base + addons. Lo seguimos persistiendo para queries y reportes
  // viejos. Se va a eliminar en una fase posterior.
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

// ── Ropa de trabajo ──
export interface RopaCategoria {
  id:                 number
  nombre:             string
  icono:              string | null
  activo:             boolean
  meses_vencimiento:  number
}

export interface RopaEntrega {
  id:            number
  leg:           string
  categoria_id:  number
  fecha_entrega: string
  obs:           string | null
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
export interface Prestamo {
  id:         number
  leg:        string
  sem_key:    string
  tipo:       'otorgado' | 'descontado'
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
export type ItemEstado =
  | 'pendiente'
  | 'comprado'
  | 'de_deposito'
  | 'en_proveedor'   // comprado pero queda en el galpón del proveedor
  | 'retirado'       // ya se retiró del proveedor (terminal o paso previo a 'enviado')
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
  unidad:           string
  obs?:             string | null
  estado:           ItemEstado
  material_id?:     number | null
  proveedor_id?:    number | null
  precio_unit?:     number | null
  factura_id?:      number | null
  fecha_resolucion?: string | null
  fecha_envio?:     string | null
  /** Quién pagó esta compra. Default `'cadinc'` en datos históricos. */
  pagado_por?:      PagadoPor
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
   * Quién pagó al proveedor. Si `'cadinc'` → suma a la cuenta del cliente
   * (deuda). Si `'cliente'` → solo se registra para rendición (no deuda).
   * Heredado de `solicitud_compra_item.pagado_por` al insertar el MCC.
   */
  pagado_por:       PagadoPor
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
}

// ── Stock en Depósito ──
export interface StockRubro {
  id:     number
  nombre: string
  icono:  string | null
  orden:  number
  activo: boolean
}

export interface StockMaterial extends AuditFields {
  id:            number
  rubro_id:      number
  nombre:        string
  unidad:        string
  stock_actual:  number
  stock_minimo:  number
  precio_ref:    number
  proveedor_id:  number | null
  obs:           string | null
  activo:        boolean
  stock_rubros?: { nombre: string; icono: string | null }
  proveedores?:  { id: number; nombre: string } | null
}

export interface StockMovimiento {
  id:                number
  material_id:       number
  tipo:              'entrada' | 'salida' | 'ajuste'
  cantidad:          number
  motivo:            'compra' | 'despacho_obra' | 'devolucion' | 'ajuste_inventario'
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

// ── Certificaciones ──
export interface CertMaterial extends AuditFields {
  id:             number
  obra_cod:       string
  fecha:          string
  descripcion:    string
  proveedor:      string | null
  cantidad:       number
  unidad:         string
  precio_unit:    number
  total:          number
  obs:            string | null
  adjunto_url:    string | null
  adjunto_nombre: string | null
  compra_id:      string | null
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
