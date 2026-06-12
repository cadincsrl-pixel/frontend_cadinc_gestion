// Tipos del módulo Áridos — espejo de las tablas aridos_* (migración 20260611b_aridos.sql)

export type UnidadArido = 'm3' | 'viaje'
export type TipoMovimiento = 'venta' | 'acopio' | 'ajuste'
// 'obra' = retiro de escombro: sale de la obra del cliente hacia el depósito
export type OrigenVenta = 'cantera' | 'deposito' | 'obra'
export type MedioCobro = 'efectivo' | 'transferencia' | 'cheque' | 'otro'

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
