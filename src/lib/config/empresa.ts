// Identidad de la empresa operadora — fuente única de verdad.
//
// Hoy se alimenta de variables de entorno (modelo "silo": una instancia por
// empresa; se setea al deployar). CADINC es el default, así que la instancia
// de CADINC funciona igual sin configurar nada.
//
// Forward-compatible con multi-tenant: el día que se pase a una sola instancia
// para varias empresas (modelo "pool"), solo cambia DE DÓNDE sale este dato
// (de env → fetch a la tabla de empresas por tenant). Los ~12 lugares que lo
// consumen siguen leyendo de `EMPRESA`/`empresaNombreCompleto()` sin cambios.
//
// Nota Next.js: los `NEXT_PUBLIC_*` se inlinean en build, así que en el modelo
// silo (un build por empresa) alcanza. Para el modelo pool habría que mover la
// fuente a runtime (server component / endpoint), pero la interfaz no cambia.

export const EMPRESA = {
  /** Nombre comercial / razón social que se muestra y se imprime en documentos. */
  nombre:  process.env.NEXT_PUBLIC_EMPRESA_NOMBRE  ?? 'CADINC SRL',
  /** CUIT para solicitudes (turno/transferencia) y documentos formales. */
  cuit:    process.env.NEXT_PUBLIC_EMPRESA_CUIT    ?? '33-71719194-9',
  /** Domicilio fiscal, para documentos impresos (orden de pago). Sale de las facturas de proveedor. */
  domicilio: process.env.NEXT_PUBLIC_EMPRESA_DOMICILIO ?? 'Maipú 396, Dpto. 3 — San Miguel de Tucumán, Tucumán',
  /** Ruta/URL del logo (login, selector de módulos). */
  // Símbolo naranja + «CADINC» en blanco, recortado al contenido (2026-09-23).
  // Los originales del estudio de diseño están en `diseno/marca/`.
  logoUrl: process.env.NEXT_PUBLIC_EMPRESA_LOGO    ?? '/marca/cadinc-oscuro.png',
  /** Logo para PAPEL (fondo blanco). El de arriba es blanco, para el fondo oscuro de la app. */
  logoPapelUrl: process.env.NEXT_PUBLIC_EMPRESA_LOGO_PAPEL ?? '/marca/cadinc-color.png',

  // ── Datos del EMISOR en la factura de venta (20260924) ──
  // Calcados de la factura A 00002-00001273 de Finnegans: es lo que el cliente
  // ya está acostumbrado a leer. Ingresos Brutos es el mismo número del CUIT.
  /** Razón social tal como se imprime en la factura. */
  razonSocialFactura: process.env.NEXT_PUBLIC_EMPRESA_RAZON_SOCIAL ?? 'CADINC S.R.L.',
  /** Domicilio de la factura, en dos renglones como en Finnegans. */
  domicilioFactura1: process.env.NEXT_PUBLIC_EMPRESA_DOMICILIO_FACTURA_1 ?? 'Maipú 396 3 – San Miguel de Tucumán',
  domicilioFactura2: process.env.NEXT_PUBLIC_EMPRESA_DOMICILIO_FACTURA_2 ?? '(4000) Tucumán Argentina',
  tel:               process.env.NEXT_PUBLIC_EMPRESA_TEL               ?? '3815 02-5772',
  condicionIva:      process.env.NEXT_PUBLIC_EMPRESA_CONDICION_IVA     ?? 'Responsable Inscripto',
  iibb:              process.env.NEXT_PUBLIC_EMPRESA_IIBB              ?? '33-71719194-9',
  /** DD/MM/YYYY */
  inicioActividades: process.env.NEXT_PUBLIC_EMPRESA_INICIO_ACTIVIDADES ?? '14/08/2020',
} as const

/** Helper para labels tipo "Flota CADINC". */
export function conEmpresa(prefijo: string): string {
  return `${prefijo} ${EMPRESA.nombre}`
}

/**
 * Marca de dos tonos para el topbar: resalta la última palabra (acento).
 * "CADINC SRL" → { label: 'CADINC', accent: 'SRL' } (idéntico al look actual).
 * "Transportes Pérez" → { label: 'Transportes', accent: 'Pérez' }.
 */
export function marcaEmpresa(): { label: string; accent: string } {
  const p = EMPRESA.nombre.trim().split(/\s+/)
  return p.length > 1
    ? { label: p.slice(0, -1).join(' '), accent: p[p.length - 1]! }
    : { label: EMPRESA.nombre, accent: '' }
}
