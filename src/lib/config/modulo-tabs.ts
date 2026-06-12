// Definición de tabs disponibles por módulo. Es la ÚNICA fuente de verdad:
// - Form de permisos: usa label + icon para mostrar tabs configurables.
// - Sidebar: itera con `<ModuloNav>` y rendera label + meta + icon.
// - Pages (`Cert/Caja/etc.`): usan `useTabsPermitidos` que cruza con esta lista.
//
// `meta` es un subtítulo opcional que solo se muestra en el sidebar (no en
// el form de permisos). Mantenerlo opcional para que módulos sin sub-label
// no se rompan.

export interface TabDef {
  key:   string
  label: string
  icon:  string
  /** Subtítulo descriptivo del sidebar. Opcional. */
  meta?: string
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
    { key: 'configuracion',    label: 'Categorías y tarifas', icon: '⚙️' },
    { key: 'archivadas',       label: 'Obras archivadas',   icon: '📦' },
  ],
  logistica: [
    { key: 'viajes',        label: 'Tramos',            icon: '🚛', meta: 'Cargados y vacíos' },
    { key: 'en-ruta',       label: 'En ruta',           icon: '🛰', meta: 'Camiones cargados en vivo' },
    { key: 'liquidaciones', label: 'Liquidaciones',     icon: '💰', meta: 'Saldo y pago a choferes' },
    { key: 'facturacion',   label: 'Facturación',       icon: '🧾', meta: 'Cobros a empresas' },
    { key: 'choferes',      label: 'Choferes',          icon: '👷', meta: 'Personal de conducción' },
    { key: 'camiones',      label: 'Camiones y bateas', icon: '🚚', meta: 'Flota de camiones y semirremolques' },
    { key: 'lugares',       label: 'Rutas',             icon: '🗺️', meta: 'Rutas · Canteras · Depósitos' },
    { key: 'gastos',        label: 'Gastos',            icon: '💸', meta: 'Combustible · Gomería · Peajes' },
    { key: 'rentabilidad',  label: 'Rentabilidad',      icon: '📈', meta: 'Simulador de margen por viaje' },
  ],
  herramientas: [
    { key: 'inventario',   label: 'Inventario',   icon: '🔧' },
    { key: 'movimientos',  label: 'Movimientos',  icon: '↔' },
    { key: 'trazabilidad', label: 'Trazabilidad', icon: '📍' },
    { key: 'remitos',      label: 'Remitos',      icon: '📄' },
    { key: 'parametros',   label: 'Parámetros',   icon: '⚙️' },
  ],
  certificaciones: [
    { key: 'solicitudes',     label: 'Solicitudes',          icon: '🛒',  meta: 'Pedidos de compra y envío' },
    { key: 'stock',           label: 'Stock',                icon: '🏗️', meta: 'Stock en depósito' },
    { key: 'stock-proveedor', label: 'Stock en proveedores', icon: '🏭',  meta: 'Materiales comprados sin retirar' },
    { key: 'materiales',      label: 'Materiales',           icon: '📦',  meta: 'A cuenta del cliente' },
    { key: 'cuenta-cliente',  label: 'Cuenta del cliente',   icon: '💳',  meta: 'Deuda y pagos directos' },
  ],
  caja: [
    { key: 'movimientos',   label: 'Movimientos',   icon: '💵', meta: 'Ingresos y egresos' },
    { key: 'resumen',       label: 'Resumen',       icon: '📊', meta: 'Totales por período' },
    { key: 'configuracion', label: 'Configuración', icon: '⚙️', meta: 'Conceptos y centros' },
  ],
  admin: [
    { key: 'usuarios',   label: 'Usuarios y permisos', icon: '👥', meta: 'Cuentas, roles y accesos' },
    { key: 'plantillas', label: 'Plantillas de roles', icon: '🎭', meta: 'Alcance de cada preset' },
    { key: 'auditoria',  label: 'Auditoría',           icon: '📋', meta: 'Registro de actividad' },
  ],
  flota: [
    { key: 'vehiculos',  label: 'Vehículos',  icon: '🚙', meta: 'Flota interna de CADINC' },
    { key: 'servicios',  label: 'Servicios',  icon: '🔧', meta: 'Historial de mantenimiento' },
    { key: 'gastos',     label: 'Gastos',     icon: '💸', meta: 'Combustible, peajes, etc.' },
    { key: 'parametros', label: 'Parámetros', icon: '⚙️', meta: 'Tipos de servicio' },
  ],
  alquiler: [
    { key: 'remitos',  label: 'Remitos',  icon: '🧾', meta: 'Remitos diarios y carga rápida' },
    { key: 'partes',   label: 'Partes',   icon: '📝',  meta: 'Carga de horas por día' },
    { key: 'maquinas', label: 'Máquinas', icon: '🚜',  meta: 'Flota de maquinaria' },
    { key: 'obras',    label: 'Obras',    icon: '🏗',  meta: 'Obras de alquiler y asignaciones' },
    { key: 'clientes', label: 'Clientes', icon: '🧑‍💼', meta: 'Fichas de clientes' },
    { key: 'reportes', label: 'Reportes', icon: '📊', meta: 'Horas por máquina y por obra' },
    { key: 'cuenta-corriente', label: 'Cuenta corriente', icon: '💰', meta: 'Devengado y saldo por cliente' },
  ],
  aridos: [
    { key: 'ventas',     label: 'Ventas',     icon: '🛒', meta: 'Ventas por m³ y retiros de escombro' },
    { key: 'acopios',    label: 'Acopios',    icon: '⛏', meta: 'Entradas de cantera al depósito y ajustes' },
    { key: 'stock',      label: 'Stock',      icon: '📦', meta: 'Disponible por material en el depósito' },
    { key: 'clientes',   label: 'Clientes',   icon: '🧑‍💼', meta: 'Fichas y precios por cliente' },
    { key: 'materiales', label: 'Materiales', icon: '🪨', meta: 'Catálogo, costos de cantera y municipios' },
    { key: 'flota',      label: 'Canteras y unidades', icon: '🚚', meta: 'Canteras propias y camiones con GPS' },
    { key: 'cuenta-corriente', label: 'Cuenta corriente', icon: '💰', meta: 'Vendido, cobrado y saldo por cliente' },
  ],
}
