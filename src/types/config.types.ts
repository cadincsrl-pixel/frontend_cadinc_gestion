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
