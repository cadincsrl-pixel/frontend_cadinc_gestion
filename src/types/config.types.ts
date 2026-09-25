/**
 * Tipos de la configuración editable desde la pantalla (tanda 6, spec
 * «configuración del ERP desde la pantalla»). Archivo aparte de
 * domain.types.ts a propósito, para que las piezas no se pisen.
 */

/** GET/PATCH /api/empresa (20260929a). */
export interface EmpresaApi {
  razon_social:       string
  nombre_fantasia:    string
  /** 11 dígitos, sin guiones. No se edita: lo define el certificado de ARCA. */
  cuit:               string
  /** NN-NNNNNNNN-N */
  cuit_fmt:           string
  condicion_iva:      string
  iibb:               string
  /** YYYY-MM-DD o null. */
  inicio_actividades: string | null
  domicilio_calle:    string
  /** Calle como se imprime en la factura (renglón 1). Vacía = domicilio_calle. */
  calle_factura:      string
  localidad:          string
  provincia:          string
  codigo_postal:      string
  telefono:           string
  email:              string
  /** Derivados que arma la base. */
  domicilio:           string
  domicilio_factura_1: string
  domicilio_factura_2: string
  updated_at:         string | null
  updated_by:         string | null
  cuit_sistema:       { arca_cuit: string; coincide: boolean }
}

/** Campos editables (PATCH parcial). Sin `cuit`. */
export type EmpresaEditable = Pick<EmpresaApi,
  'razon_social' | 'nombre_fantasia' | 'condicion_iva' | 'iibb' | 'inicio_actividades'
  | 'domicilio_calle' | 'calle_factura' | 'localidad' | 'provincia' | 'codigo_postal'
  | 'telefono' | 'email'>

/** GET /api/facturacion/productos (20260929b). Ventas › Configuración › Productos. */
export interface ProductoVenta {
  id:            number
  nombre:        string
  descripcion:   string
  /** 1 productos · 2 servicios · 3 productos y servicios (FEParamGetTiposConcepto). */
  concepto_arca: 1 | 2 | 3
  /** La factura exige obra (el centro de costo). */
  pide_obra:     boolean
  /** La factura exige período de servicio (FchServDesde/Hasta). Solo concepto 2/3. */
  pide_periodo:  boolean
  activo:        boolean
  orden:         number
  /** Facturas (no descartadas) que lo usan. */
  facturas:      number
  /** ¿Tiene cuenta en Contabilidad › Mapeos (Ventas por producto)? */
  mapeado:       boolean
}

/** POST (alta) / PATCH (parcial, + `activo`) de un producto de venta. */
export interface ProductoVentaInput {
  nombre?:        string
  descripcion?:   string
  concepto_arca?: 1 | 2 | 3
  pide_obra?:     boolean
  pide_periodo?:  boolean
  orden?:         number
  activo?:        boolean
}

/** GET /api/facturacion/puntos-venta (20260929d). Ventas › Configuración › Puntos de venta. */
export interface PuntoVentaVenta {
  id:                 number
  ambiente:           'homo' | 'prod'
  numero:             number
  nombre:             string
  activo:             boolean
  /** Uno por ambiente: el que usa la factura si no se elige otro. */
  por_defecto:        boolean
  /** Productos que lo sugieren al cargar la factura. */
  producto_ids:       number[]
  /** Foto de FEParamGetPtosVenta (null = nunca se pudo verificar con ARCA). */
  arca_emision_tipo:  string | null
  arca_bloqueado:     boolean | null
  arca_fch_baja:      string | null
  verificado_arca_at: string | null
  /** Facturas (no descartadas) de ese ambiente con ese PV. */
  facturas:           number
}

/** POST (alta: `numero` obligatorio, `forzar` = guardar aunque ARCA no lo confirme) / PATCH (parcial). */
export interface PuntoVentaVentaInput {
  numero?:       number
  nombre?:       string
  activo?:       boolean
  por_defecto?:  boolean
  producto_ids?: number[]
  forzar?:       boolean
}

/** POST /puntos-venta/:id/verificar → `verificacion`. */
export type VerificacionPuntoVenta =
  | { estado: 'ok' }
  | { estado: 'rechazado'; codigo: string; disponibles: number[] }
  | { estado: 'no_verificado'; motivo: string }

/** Vencimiento del certificado de ARCA del servidor (nunca el certificado). */
export interface CertificadoArca {
  /** ISO 8601. */
  vence_el:         string
  dias_restantes:   number
  vencido:          boolean
  sujeto_cn:        string | null
  /** En homologación es el del representante, no el de CADINC: es normal. */
  cuit_certificado: string | null
}

/** GET /api/facturacion/arca/ambiente (instantáneo). Los campos de 20260929d faltan contra un backend viejo. */
export interface ArcaAmbienteInfo {
  ambiente:           'homo' | 'prod' | null
  configurado:        boolean
  falta:              string[]
  /** El PV por defecto (de la tabla, o el del env si está vacía). */
  pto_vta:            number
  /** PV activos del ambiente. */
  puntos_venta?:      Array<{ numero: number; nombre: string; por_defecto: boolean; producto_ids: number[] }>
  certificado?:       CertificadoArca | null
  certificado_error?: string | null
}
