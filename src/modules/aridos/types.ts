// Tipos del módulo Áridos — espejo de las tablas aridos_* (migración 20260611b_aridos.sql)

export type UnidadArido = 'm3' | 'viaje'
export type TipoMovimiento = 'venta' | 'acopio' | 'ajuste'
// 'obra' = servicio sin stock: retiro de escombro (obra del cliente → depósito)
// o flete punto a punto. Se distinguen por el nombre del material (esMaterialFlete).
export type OrigenVenta = 'cantera' | 'deposito' | 'obra'
export type MedioCobro = 'efectivo' | 'transferencia' | 'cheque' | 'otro'

// El "Flete" (servicio punto A → punto B) se detecta por nombre de material —
// no hay flag en la tabla. Si se renombra el material, tiene que seguir
// diciendo "flete" para que la venta y los remitos lo traten como tal.
export function esMaterialFlete(nombre: string | null | undefined): boolean {
  return (nombre ?? '').toLowerCase().includes('flete')
}

export interface MunicipioArido {
  id: number
  nombre: string
  recargo_pct: number
  obs: string | null
}

// Lista de precios de la cantera (proveedor): concepto del proveedor
// × zona de entrega, con historial de vigencia. La unidad es del precio:
// materiales por m³ (Centeno vende por viaje de 5 m³ → convertido),
// servicios por viaje (escombros) u hora (máquina).
export interface CostoCantera {
  id: number
  cantera_id: number
  concepto: string | null
  zona: string | null
  material_id: number | null
  costo: number
  unidad: 'm3' | 'viaje' | 'hora'
  vigente_desde: string
  obs: string | null
  canteras?: { nombre: string }
  aridos_materiales?: { nombre: string; unidad: UnidadArido } | null
}

export interface PagoCantera {
  id: number
  cantera_id: number
  fecha: string
  monto: number
  medio: MedioCobro
  obs: string | null
  aridos_canteras?: { nombre: string }
}

export interface CuentaCorrienteCantera {
  id: number
  nombre: string
  obs: string | null
  retiros: number
  retiros_sin_costo: number
  retirado: number
  pagado: number
  saldo: number
}

// Canteras y unidades PROPIAS del negocio de áridos (independientes de logística)
export interface CanteraArido {
  id: number
  nombre: string
  direccion: string | null
  localidad: string | null
  // Link de Google Maps + coordenadas del pin. Mismo mecanismo que los lugares
  // de logística (ver el componente MapsUrlInput).
  maps_url: string | null
  lat: number | null
  lng: number | null
  obs: string | null
  activo: boolean
}

export interface UnidadFlota {
  id: number
  nombre: string
  patente: string
  chofer: string | null
  activo: boolean
  id_vehiculo_gps: string | null
  gps_ultima_lat: number | null
  gps_ultima_lng: number | null
  gps_ultima_velocidad: number | null
  gps_ultima_lectura_en: string | null
  obs: string | null
}

export interface UnidadEta {
  unidad: { id: number; nombre: string; patente: string; chofer: string | null }
  posicion: { lat: number; lng: number; velocidad: number | null; lectura_en: string | null }
  destino: { direccion: string; lat: number; lng: number }
  distancia_km: number
  eta_min: number
  eta_traffic_min: number | null
}

export interface MaterialArido {
  id: number
  nombre: string
  unidad: UnidadArido
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ClienteArido {
  id: number
  nombre: string
  cuit: string | null
  tel: string | null
  email: string | null
  direccion: string | null
  obs: string | null
  created_at: string
  updated_at: string
}

export interface PrecioGlobal {
  id: number
  material_id: number
  precio: number
  vigente_desde: string
  obs: string | null
  aridos_materiales?: { nombre: string; unidad: UnidadArido }
}

export interface PrecioCliente {
  id: number
  cliente_id: number
  material_id: number
  precio: number
  vigente_desde: string
  obs: string | null
  aridos_clientes?: { nombre: string }
  aridos_materiales?: { nombre: string; unidad: UnidadArido }
}

export interface MovimientoArido {
  id: number
  tipo: TipoMovimiento
  fecha: string
  hora: string | null
  material_id: number
  cantidad: number
  origen: OrigenVenta | null
  cantera_id: number | null
  cliente_id: number | null
  precio_unit: number | null
  importe: number | null
  precio_especial: boolean
  entrega_direccion: string | null
  municipio_id: number | null
  unidad_id: number | null
  costo_unit: number | null
  costo_total: number | null
  flete_obs: string | null
  remito: string | null
  cobro_id: number | null
  remito_numero: string | null
  remito_emitido_en: string | null
  obs: string | null
  created_at: string
  aridos_materiales?: { nombre: string; unidad: UnidadArido }
  aridos_clientes?: { nombre: string } | null
  aridos_municipios?: { nombre: string; recargo_pct: number } | null
  aridos_canteras?: { nombre: string } | null
  aridos_unidades?: { nombre: string; patente: string; chofer: string | null } | null
}

export interface StockMaterial {
  material_id: number
  nombre: string
  unidad: UnidadArido
  activo: boolean
  entradas: number
  salidas: number
  ajustes: number
  stock: number
}

export interface CobroArido {
  id: number
  cliente_id: number
  fecha: string
  monto: number
  medio: MedioCobro
  obs: string | null
  created_at: string
  aridos_clientes?: { nombre: string }
}

export interface CuentaCorrienteArido {
  id: number
  nombre: string
  cuit: string | null
  tel: string | null
  vendido: number
  cobrado: number
  saldo: number
}

// ── Gastos del área ───────────────────────────────────────────────────
// Áridos anota lo que gasta cada camión para poder medir el resultado del mes.
// No hay estado ni aprobación a propósito: los carga quien tiene los
// comprobantes y el dueño lee el número. Ver el encabezado del servicio del
// backend (`aridos-gastos.service.ts`) para el porqué largo.

export interface CategoriaGastoArido {
  id:                   number
  codigo:               string
  nombre:               string
  activo:               boolean
  orden:                number
  lleva_iva:            boolean
  /** Peaje y gomería son hechos consumados: no se cargan adelantados. */
  permite_fecha_futura: boolean
}

export interface CargaCombustible {
  litros:           number
  odometro_km:      number | null
  tipo_combustible: 'gasoil' | 'nafta'
  tanque_lleno:     boolean
  /** Odómetro que retrocede, consumo fuera de banda. No bloquean la carga. */
  warnings:         Array<{ code: string; detail?: unknown }>
  obs:              string | null
}

export interface GastoArido {
  id:              number
  fecha:           string
  categoria_id:    number
  /** NULL es un renglón real: gasto del área, no de un camión. */
  unidad_id:       number | null
  monto:           number
  descripcion:     string | null
  proveedor:       string | null
  metodo_pago:     string | null
  comprobante_nro: string | null
  comprobante_path: string | null
  obs:             string | null
  created_at:      string
  categoria?: Pick<CategoriaGastoArido, 'id' | 'codigo' | 'nombre' | 'lleva_iva'> | null
  unidad?:    { id: number; nombre: string; patente: string } | null
  /** El backend la devuelve como array por la relación 1-1 de PostgREST. */
  carga?:     CargaCombustible[] | CargaCombustible | null
}

export interface CargaCombustibleVista {
  id:               number
  gasto_id:         number
  fecha:            string
  unidad_id:        number | null
  unidad:           string | null
  patente:          string | null
  monto:            number
  litros:           number
  odometro_km:      number | null
  tipo_combustible: string
  tanque_lleno:     boolean
  warnings:         Array<{ code: string; detail?: unknown }>
  proveedor:        string | null
  precio_litro:     number | null
}

export interface ResultadoMesArido {
  mes:            string
  unidad_id:      number | null
  unidad:         string
  patente:        string | null
  ingresos:       number
  costo_material: number
  gastos:         number
  mano_obra:      number
  /** Compra a stock. Queda AFUERA del resultado: es costo recién al vender. */
  costo_acopio:   number
  resultado:      number
}

export interface GastoMesPorCategoria {
  mes:               string
  unidad_id:         number | null
  unidad:            string
  categoria_codigo:  string
  categoria:         string
  movimientos:       number
  total:             number
}

export interface FilaImportacion {
  fecha:            string
  categoria_id:     number
  unidad_id?:       number | null
  monto:            number
  descripcion?:     string | null
  proveedor?:       string | null
  metodo_pago?:     string | null
  comprobante_nro?: string | null
  obs?:             string | null
  carga?: {
    litros:            number
    odometro_km?:      number | null
    tipo_combustible?: 'gasoil' | 'nafta'
    tanque_lleno?:     boolean
    obs?:              string | null
  } | null
}

export interface ResultadoImportacion {
  dry_run:    boolean
  total:      number
  creados:    number
  duplicados: number
  errores:    number
  resultados: Array<{
    n:        number
    estado:   'ok' | 'duplicado' | 'error'
    gasto_id?: number
    code?:    string
    detail?:  unknown
    warnings?: Array<{ code: string; detail?: unknown }>
  }>
}

// ── Choferes del área ─────────────────────────────────────────────────
// Padrón propio: no son los choferes de logística (que cobran por km o por
// porcentaje) ni el personal de tarja (que cobra por hora y semana
// viernes-jueves). Estos cobran por día trabajado.

export interface ChoferArido {
  id:               number
  nombre:           string
  dni:              string | null
  tel:              string | null
  activo:           boolean
  obs:              string | null
  /** El jornal que rige hoy. Null = todavía no se le cargó ninguno. */
  jornal_vigente:   number | null
  jornal_desde:     string | null
  versiones_jornal: number
}

export interface JornalChofer {
  id:            number
  chofer_id:     number
  jornal:        number
  vigente_desde: string
  obs:           string | null
  created_at:    string
}

export interface DiaChofer {
  id:              number
  chofer_id:       number
  fecha:           string
  unidad_id:       number | null
  /** Congelado al marcar el día: subir el jornal no mueve meses ya pagados. */
  jornal_aplicado: number | null
  obs:             string | null
  aridos_choferes?: { nombre: string } | null
  aridos_unidades?: { nombre: string; patente: string } | null
}

export interface PagoMesChofer {
  mes:             string
  chofer_id:       number
  chofer:          string
  unidad_id:       number | null
  unidad:          string | null
  dias:            number
  /** > 0 significa que el total está incompleto: hay días sin jornal cargado. */
  dias_sin_jornal: number
  a_pagar:         number
}
