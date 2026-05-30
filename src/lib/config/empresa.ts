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
  /** Ruta/URL del logo (login, selector de módulos). */
  logoUrl: process.env.NEXT_PUBLIC_EMPRESA_LOGO    ?? '/logo-cadinc.png',
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
