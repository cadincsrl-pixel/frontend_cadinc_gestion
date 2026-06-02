/**
 * Fuente única de verdad del catálogo de módulos en el FRONTEND.
 *
 * IMPORTANTE: el array `MODULOS` tiene que estar sincronizado con su gemelo
 * en el backend (`cadincsrl/src/lib/modulos.ts`). Cuando agregás un módulo,
 * tocás los DOS archivos.
 *
 * Acá además guardamos metadata de UI (nombre legible, ícono, descripción)
 * que en el backend no hace falta.
 */

export const MODULOS = [
  'tarja',
  'logistica',
  'certificaciones',
  'herramientas',
  'caja',
  'ropa',
  'prestamos',
  'configuracion',
  'flota',
  'alquiler',
  'admin',
] as const

export type Modulo = (typeof MODULOS)[number]

export const MODULO_SET: ReadonlySet<string> = new Set<string>(MODULOS)

export function esModuloValido(x: string | null | undefined): x is Modulo {
  return !!x && MODULO_SET.has(x)
}

/**
 * Metadata de UI para cada módulo. El orden de las filas también es el
 * orden de aparición en el selector de módulos del home.
 */
export interface ModuloInfo {
  key:         Modulo
  label:       string
  descripcion: string
  icono:       string
  orden:       number
  /** Si true, no se muestra en el selector "+ Asignar módulo" del form
   *  de admin (caso: 'admin' no se asigna, se hereda del rol). */
  noAsignable?: boolean
}

export const MODULO_INFO: Record<Modulo, ModuloInfo> = {
  tarja:           { key: 'tarja',           label: 'Tarja de Obra',    descripcion: 'Control de horas y personal',           icono: '📋', orden: 1 },
  logistica:       { key: 'logistica',       label: 'Logística',        descripcion: 'Transporte de camiones',                icono: '🚛', orden: 2 },
  herramientas:    { key: 'herramientas',    label: 'Herramientas',     descripcion: 'Control de herramientas y equipos',     icono: '🔧', orden: 3 },
  certificaciones: { key: 'certificaciones', label: 'Compras y Stock',  descripcion: 'Solicitudes, materiales y stock',       icono: '🛒', orden: 4 },
  caja:            { key: 'caja',            label: 'Caja',             descripcion: 'Efectivo y movimientos',                icono: '💵', orden: 5 },
  ropa:            { key: 'ropa',            label: 'Ropa',             descripcion: 'Entregas de ropa por categoría',        icono: '👕', orden: 6 },
  prestamos:       { key: 'prestamos',       label: 'Préstamos',        descripcion: 'Adelantos y descuentos',                icono: '💸', orden: 7 },
  configuracion:   { key: 'configuracion',   label: 'Categorías y tarifas', descripcion: 'Valor hora global por categoría',   icono: '⚙️', orden: 8 },
  flota:           { key: 'flota',           label: 'Flota CADINC',     descripcion: 'Vehículos internos (autos, camionetas)', icono: '🚙', orden: 9 },
  alquiler:        { key: 'alquiler',        label: 'Alquiler de maquinaria', descripcion: 'Máquinas, obras y partes de horas', icono: '🚜', orden: 10 },
  admin:           { key: 'admin',           label: 'Administración',   descripcion: 'Usuarios, permisos y auditoría',        icono: '⚙', orden: 0, noAsignable: true },
}

/** Devuelve los módulos en el orden definido por `orden`. */
export function modulosOrdenados(opts: { incluirAdmin?: boolean } = {}): ModuloInfo[] {
  return MODULOS
    .map(k => MODULO_INFO[k])
    .filter(m => opts.incluirAdmin || !m.noAsignable)
    .sort((a, b) => a.orden - b.orden)
}
