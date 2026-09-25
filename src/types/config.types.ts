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

// ── Montos de ARCA con vigencia (20260929e) ─────────────────────────────────

export type ClaveParametroVenta = 'monto_minimo_fce' | 'tope_cf_identificacion'

/** Una fila de `ventas_parametros` (GET /api/facturacion/parametros). No se edita: un valor nuevo es una fila nueva. */
export interface ParametroVenta {
  id:            number
  clave:         ClaveParametroVenta
  valor:         number
  /** YYYY-MM-DD. */
  vigente_desde: string
  fuente:        string
  obs:           string
  created_at:    string
  created_by:    string | null
  /** Respecto de hoy: la que rige, una que ya no, o una que todavía no (solo esas se borran). */
  estado:        'vigente' | 'historico' | 'futuro'
}

/** POST /api/facturacion/parametros. `forzar` = guardar aunque haya facturas autorizadas desde esa fecha. */
export interface ParametroVentaInput {
  clave:         ClaveParametroVenta
  valor:         number
  vigente_desde: string
  fuente?:       string
  obs?:          string
  forzar?:       boolean
}

/** GET /api/facturacion/parametros/vigentes?fecha= */
export interface ParametrosVigentes {
  fecha:                  string
  monto_minimo_fce:       number
  tope_cf_identificacion: number
}

// ── Jurisdicciones (20260929f): catálogo compartido de Compras y Ventas ─────

export type TipoJurisdiccion = 'nacional' | 'provincial' | 'municipal'

/** GET /api/catalogos/jurisdicciones. */
export interface Jurisdiccion {
  id:               number
  nombre:           string
  tipo:             TipoJurisdiccion
  /** Solo los municipios: la provincia de la que cuelgan. */
  provincia_id:     number | null
  provincia_nombre: string | null
  /** Código de jurisdicción del Convenio Multilateral (901 CABA … 924 Tucumán). */
  codigo_comarb:    string | null
  /** Código de provincia de ARCA (0 CABA … 24 Tierra del Fuego). */
  codigo_arca:      number | null
  /** Otras formas de escribirla (normalizadas: sin tildes ni mayúsculas). */
  alias:            string[]
  activo:           boolean
  usos:             { tributos: number; retenciones: number }
}

/** POST (alta) / PATCH (parcial, + `activo`). */
export interface JurisdiccionInput {
  nombre?:        string
  tipo?:          TipoJurisdiccion
  provincia_id?:  number | null
  codigo_comarb?: string | null
  codigo_arca?:   number | null
  alias?:         string[]
  activo?:        boolean
}

/** GET /api/catalogos/jurisdicciones/sin-normalizar: textos viejos que no resolvieron a ninguna. */
export interface JurisdiccionSinNormalizar {
  texto: string
  tabla: 'pagos_factura_tributos' | 'ventas_cobro_retenciones'
  filas: number
}

/** Lo que elige un `JurisdiccionSelect`: el id del catálogo y el nombre (foto). */
export interface JurisdiccionElegida {
  id:     number | null
  nombre: string
}

/** GET /api/pagos/config (20260929f; el ítem 8 le suma avisos y cheques). */
export interface PagosConfig {
  tributos: { jurisdiccion_default_id: number | null }
}

// ── Tipos de retención sufrida (20260929g) ──────────────────────────────────

export type ImpuestoRetencion = 'iva' | 'ganancias' | 'iibb' | 'suss' | 'municipal' | 'otro'

/** GET /api/facturacion/retencion-tipos. */
export interface RetencionTipoVenta {
  /** La que guarda cada retención. No se edita. */
  clave:                       string
  nombre:                      string
  corto:                       string
  /** `iva` es reservado y único (Libro IVA, asiento mensual). */
  impuesto:                    ImpuestoRetencion
  pide_jurisdiccion:           boolean
  jurisdiccion_default_id:     number | null
  jurisdiccion_default_nombre: string | null
  /** Los 6 de siempre: no cambian clave ni impuesto. */
  sistema:                     boolean
  activo:                      boolean
  orden:                       number
  /** Retenciones cargadas con este tipo. */
  retenciones:                 number
  /** ¿Tiene cuenta en Contabilidad › Mapeos (Retenciones sufridas)? */
  mapeado:                     boolean
}

/** POST (alta; la clave sale del corto si no viene) / PATCH (parcial). */
export interface RetencionTipoVentaInput {
  clave?:                   string
  nombre?:                  string
  corto?:                   string
  impuesto?:                ImpuestoRetencion
  pide_jurisdiccion?:       boolean
  jurisdiccion_default_id?: number | null
  activo?:                  boolean
  orden?:                   number
}

/** GET/PATCH /api/facturacion/config (20260929g; el ítem 9 suma los valores por defecto de la factura). */
export interface VentasConfigValores {
  retencion_tipo_default: string
}
