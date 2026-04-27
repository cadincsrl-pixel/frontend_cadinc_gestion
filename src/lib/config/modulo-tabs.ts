// Definición de tabs disponibles por módulo
// Se usa para: formulario de permisos, filtro de sidebar, filtro de pages

export interface TabDef {
  key: string
  label: string
  icon: string
}

export const TABS_POR_MODULO: Record<string, TabDef[]> = {
  tarja: [
    { key: 'tarja',            label: 'Tarja',              icon: '📋' },
    { key: 'dashboard',        label: 'Resumen General',    icon: '📊' },
    { key: 'horas-trabajador', label: 'Horas x Trabajador', icon: '👤' },
    { key: 'prestamos',        label: 'Préstamos',          icon: '💵' },
    { key: 'ropa',             label: 'Ropa de trabajo',    icon: '👕' },
    { key: 'personal',         label: 'Personal',           icon: '👷' },
    { key: 'costos',           label: 'Costos',             icon: '📊' },
    { key: 'configuracion',    label: 'Configuración',      icon: '⚙️' },
    { key: 'archivadas',       label: 'Obras archivadas',   icon: '📦' },
  ],
  logistica: [
    { key: 'viajes',        label: 'Tramos',        icon: '🚛' },
    { key: 'liquidaciones', label: 'Liquidaciones', icon: '💰' },
    { key: 'facturacion',   label: 'Facturación',   icon: '🧾' },
    { key: 'choferes',      label: 'Choferes',      icon: '👷' },
    { key: 'camiones',      label: 'Camiones y bateas', icon: '🚚' },
    { key: 'lugares',       label: 'Lugares',       icon: '📍' },
    { key: 'gastos',        label: 'Gastos',        icon: '💸' },
  ],
  herramientas: [
    { key: 'inventario',   label: 'Inventario',   icon: '🔧' },
    { key: 'movimientos',  label: 'Movimientos',  icon: '↔' },
    { key: 'trazabilidad', label: 'Trazabilidad', icon: '📍' },
    { key: 'remitos',      label: 'Remitos',      icon: '📄' },
    { key: 'parametros',   label: 'Parámetros',   icon: '⚙️' },
  ],
  certificaciones: [
    { key: 'solicitudes', label: 'Solicitudes', icon: '🛒' },
    { key: 'stock',       label: 'Stock',       icon: '🏗️' },
    { key: 'materiales',  label: 'Materiales',  icon: '📦' },
  ],
  caja: [
    { key: 'movimientos',   label: 'Movimientos',   icon: '💵' },
    { key: 'resumen',       label: 'Resumen',       icon: '📊' },
    { key: 'configuracion', label: 'Configuración', icon: '⚙️' },
  ],
  admin: [
    { key: 'usuarios',  label: 'Usuarios y permisos', icon: '👥' },
    { key: 'auditoria', label: 'Auditoría',           icon: '📋' },
  ],
}
