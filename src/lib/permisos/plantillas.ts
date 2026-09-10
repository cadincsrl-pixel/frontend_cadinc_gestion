/**
 * Roles y add-ons de permisos.
 *
 * Desde la fase 4 (2026-09) los ROLES viven en la tabla `roles` y se editan
 * desde Admin → Plantillas de roles (`GET/POST/PATCH/DELETE /api/usuarios/roles`,
 * hook `useRoles`). Este archivo conserva:
 *
 *   - `PRESETS_FALLBACK`: el seed original (5 roles). Es el fallback del
 *     wizard mientras carga el API y la referencia de labels cuando un perfil
 *     viejo solo tiene `rol_base`. NO es la fuente de verdad: editar acá no
 *     cambia nada en producción.
 *   - `ADDONS`: variaciones de tarja que se aplican encima de un rol. Siguen
 *     en código. `aplicaA` se compara contra el `rol_base` del rol (no contra
 *     su key), así un rol nuevo con rol_base='jefe_obra' hereda los addons
 *     de jefe de obra.
 *   - Helpers puros: `aplicarPreset`, `deriveAddons`, `rolToPreset`,
 *     `modulosDePermisos`, `labelDeRol`, `canonJson`.
 *
 * Cada usuario tiene `rol_key` (de qué rol partió), `rol_base` (identidad
 * que usa el backend: capataz/jefe_obra), `obras_scope` y `personalizado`
 * (true = tiene ajustes propios; "Aplicar rol" no lo pisa).
 */
import type { Permisos, Rol, RolBase, ObrasScope } from '@/types/domain.types'

// Muchos componentes importan estos tipos desde acá.
export type { RolBase, ObrasScope }

/** Identidades que entiende el backend (select de `rol_base` en el editor). */
export const ROL_BASES: { key: RolBase; label: string }[] = [
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'compras',        label: 'Compras' },
  { key: 'deposito',       label: 'Encargado de depósito' },
  { key: 'jefe_obra',      label: 'Jefe de obra' },
  { key: 'capataz',        label: 'Capataz' },
]

// ─── PRESETS (seed / fallback) ────────────────────────────────────────────────

export interface PresetBase {
  key:                 string
  label:               string
  descripcion:         string
  /** Módulos con lectura en `permisos` (derivado; el backend hace lo mismo). */
  modulos:             string[]
  permisos:            Permisos
  obras_scope_default: ObrasScope
  rol_base:            RolBase | null
}

const fullCRUD = { lectura: true, creacion: true, actualizacion: true, eliminacion: true }

export const PRESETS_FALLBACK: PresetBase[] = [
  {
    key:   'administrativo',
    label: 'Administrativo',
    descripcion: 'Gestión amplia: tarja (incluye préstamos, ropa y categorías), logística, compras y stock, caja, flota. Casi-admin sin permisos de usuarios/permisos.',
    modulos: ['tarja', 'logistica', 'certificaciones', 'caja', 'flota'],
    permisos: {
      tarja:           { ...fullCRUD, ver_costos: true, ver_pii: true, administrar_obras: true },
      logistica:       { ...fullCRUD },
      caja:            { ...fullCRUD },
      flota:           { ...fullCRUD },
      certificaciones: { ...fullCRUD, resolver_items: true, forzar_despacho: true, aprobar_ajustes_stock: true },
    },
    obras_scope_default: 'todas',
    rol_base: 'administrativo',
  },
  {
    key:   'compras',
    label: 'Compras',
    descripcion: 'Solo Compras y Stock (todas las tabs). Resuelve compras y despachos, carga precios y actualiza el catálogo.',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes', 'stock', 'catalogo', 'stock-proveedor', 'stock-cliente', 'cuenta-corriente'],
        resolver_items: true,
        forzar_despacho: true,
        // Es quien compra con la factura delante: es el único que puede
        // devolverle al catálogo el precio real. Sin este flag el tilde
        // "poner este precio en el catálogo" queda gris y la referencia
        // nunca se actualiza (10/09: cero precios con fuente 'compra').
        cargar_precios: true,
      },
    },
    obras_scope_default: 'todas',
    rol_base: 'compras',
  },
  {
    key:   'deposito',
    label: 'Encargado de depósito',
    descripcion: 'Stock interno + stock en proveedores + herramientas. Resuelve despachos SIN cargar precios. Ve solicitudes en lectura.',
    modulos: ['certificaciones', 'herramientas'],
    permisos: {
      certificaciones: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['stock', 'catalogo', 'stock-proveedor', 'solicitudes'],
        resolver_items: true,
        forzar_despacho: true,
        // Maneja el depósito, no los números: resuelve y el renglón queda
        // "esperando precio" para que lo cargue quien corresponde. Antes
        // ponía "11" o "1" para salir del paso y eso terminaba facturado.
        precio_al_resolver: false,
      },
      herramientas: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        // Excluye 'parametros' para mantener configuración de tipos/categorías
        // como territorio admin.
        // 'salidas' = la bandeja del pañol (lo que salió a obra desde un pedido).
        // Sin esta línea, reaplicar el preset le pisa el tab a quien ya lo tenía
        // por la migración 20260904d: es el 6º lugar del bug de Áridos.
        tabs: ['inventario', 'movimientos', 'trazabilidad', 'salidas', 'retornos', 'catalogo'],
      },
    },
    obras_scope_default: 'todas',
    rol_base: 'deposito',
  },
  {
    key:   'jefe_obra',
    label: 'Jefe de obra',
    descripcion: 'Crea y gestiona pedidos (solicitudes) de SUS obras. Agrega y edita trabajadores en tarja. Sin costos ni datos personales.',
    modulos: ['certificaciones', 'tarja'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes'],
      },
      tarja: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:     false,
        ver_pii:        false,
        // Override por módulo (tipo extendido vía cast, igual que en los
        // addons). Mantiene el scope='asignadas' aun si el admin cambia el
        // global del usuario.
        obras_scope:    'asignadas',
      } as Permisos[string] & { obras_scope: ObrasScope },
    },
    obras_scope_default: 'asignadas',
    rol_base: 'jefe_obra',
  },
  {
    key:   'capataz',
    label: 'Capataz',
    descripcion: 'Carga horas de la semana actual de SU obra. Sin costos ni datos sensibles.',
    modulos: ['tarja'],
    permisos: {
      tarja: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:     false,
        ver_pii:        false,
      },
    },
    obras_scope_default: 'asignadas',
    rol_base: 'capataz',
  },
]

/** @deprecated Alias de `PRESETS_FALLBACK`. Los roles reales salen de `useRoles()`. */
export const PRESETS = PRESETS_FALLBACK

/**
 * Módulos a los que dan acceso unos `permisos`: los que tienen `lectura`.
 * Espejo de `modulosDePermisos` del backend (que es quien persiste
 * `profiles.modulos`); el cliente ya no manda `modulos`.
 */
export function modulosDePermisos(permisos: Permisos | null | undefined): string[] {
  return Object.entries(permisos ?? {})
    .filter(([, v]) => !!v && v.lectura === true)
    .map(([k]) => k)
}

/** Un rol del API en el shape que consumen el wizard y `aplicarPreset`. */
export function rolToPreset(rol: Rol): PresetBase {
  return {
    key:                 rol.key,
    label:               rol.label,
    descripcion:         rol.descripcion ?? '',
    modulos:             modulosDePermisos(rol.permisos),
    permisos:            rol.permisos ?? {},
    obras_scope_default: rol.obras_scope_default,
    rol_base:            rol.rol_base,
  }
}

export function getPreset(
  key: string | null | undefined,
  presets: PresetBase[] = PRESETS_FALLBACK,
): PresetBase | null {
  if (!key) return null
  return presets.find(p => p.key === key) ?? null
}

/**
 * Label para mostrar de un usuario según su rol: busca `rol_key` en los roles
 * del API, después en el seed, después el `rol_base`. Un perfil anterior a
 * los roles editables solo trae `rol_base` (los presets viejos son roles con
 * la misma key). Devuelve null si no parte de ningún rol (personalizado puro).
 */
export function labelDeRol(
  rolKey:  string | null | undefined,
  rolBase: RolBase | null | undefined,
  roles?:  ReadonlyArray<Pick<Rol, 'key' | 'label'>>,
): string | null {
  const key = rolKey ?? rolBase ?? null
  if (!key) return null
  return roles?.find(r => r.key === key)?.label
    ?? PRESETS_FALLBACK.find(p => p.key === key)?.label
    ?? (rolBase ? ROL_BASES.find(r => r.key === rolBase)?.label : undefined)
    ?? key
}

// ─── ADD-ONS opcionales que extienden un rol ───────────────────────────────
//
// Cada addon expone:
//   - aplicar(p)  : agrega o setea las claves que el addon controla.
//   - revertir(p) : el inverso. Borra esas mismas claves o restaura
//                   defaults del preset/personalizado. NO usa state
//                   externo: solo mira `p` y deshace lo que `aplicar`
//                   habría agregado.
//   - aplicaA     : whitelist de `rol_base` donde tiene sentido (se compara
//                   contra el rol_base del rol, no contra su key). Si el
//                   user está en modo Personalizado, el wizard ofrece
//                   addons cuyo módulo target esté tildado. La validación
//                   final la hace el handler del onChange.

export interface AddOn {
  key:       string
  label:     string
  descripcion: string
  aplicar:    (p: Permisos) => Permisos
  revertir:   (p: Permisos) => Permisos
  aplicaA:   RolBase[]
  // Módulo cuya activación habilita el addon en modo Personalizado.
  // Si el user está en Personalizado, el wizard ofrece este addon
  // SOLO cuando ese módulo está tildado en `permisos`. Si queda
  // undefined, el addon se ofrece siempre que haya módulos elegidos.
  moduloTarget?: string
  // Addons mutuamente excluyentes con éste. Al tildarlo, el wizard
  // destilda los addons listados acá. Útil cuando dos addons setean
  // las mismas claves del módulo target con valores opuestos
  // (ej. tarja_lectura sin creación vs. tarja_edicion_jefe con creación).
  excluye?: string[]
}

// Helpers internos para reducir boilerplate.
function omitTarjaKeys(p: Permisos, claves: string[]): Permisos {
  const tarja = { ...((p.tarja ?? {}) as Record<string, unknown>) }
  for (const k of claves) delete tarja[k]
  // Si tarja queda vacío, lo borramos del root para mantener limpio el JSONB.
  if (Object.keys(tarja).length === 0) {
    const out = { ...p } as Permisos
    delete (out as Record<string, unknown>).tarja
    return out
  }
  return { ...p, tarja: tarja as Permisos[string] }
}

export const ADDONS: AddOn[] = [
  {
    key:   'tarja_lectura',
    label: 'Ver tarja (supervisar horas)',
    descripcion: 'Acceso de lectura al módulo Tarja para controlar la carga de horas. Sin edición.',
    aplicaA: ['jefe_obra'],
    moduloTarget: 'tarja',
    aplicar: (p) => ({
      ...p,
      // Spread del tarja existente para preservar claves que el admin
      // pueda haber tildado a mano en modo Personalizado (ej. creacion).
      // Las claves del addon pisan a las preexistentes (semántica esperada).
      tarja: {
        ...((p.tarja ?? {}) as Permisos[string]),
        lectura: true, tabs: ['tarja'],
        ver_costos: false, ver_pii: false,
      },
    }),
    revertir: (p) => omitTarjaKeys(p, ['lectura', 'tabs', 'ver_costos', 'ver_pii',]),
    excluye: ['tarja_edicion_jefe'],
  },
  {
    key:   'tarja_edicion_jefe',
    label: 'Editar tarja de sus obras',
    descripcion: 'Carga y modifica horas en las obras donde el usuario es jefe. Vista completa, sin PII ni costos. Mutuamente excluyente con "Ver tarja (supervisar horas)".',
    aplicaA: ['jefe_obra'],
    moduloTarget: 'tarja',
    aplicar: (p) => ({
      ...p,
      tarja: {
        ...((p.tarja ?? {}) as Permisos[string]),
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:     false,
        ver_pii:        false,
        // Override por módulo: tarja filtra por usuario_obras (modulo='tarja').
        // Redundante con el scope global del preset jefe_obra ('asignadas'),
        // pero lo seteamos por si el admin cambió el global a 'todas'.
        obras_scope:    'asignadas',
      },
    }),
    revertir: (p) => omitTarjaKeys(p, [
      'lectura', 'creacion', 'actualizacion', 'eliminacion', 'tabs',
      'ver_costos', 'ver_pii', 'obras_scope',
    ]),
    excluye: ['tarja_lectura'],
  },
  {
    key:   'tab_personal',
    label: 'Acceso al tab Personal',
    descripcion: 'Permite ver el listado de personal asignado a sus obras (incluye DNI, dirección, teléfono).',
    aplicaA: ['capataz'],
    moduloTarget: 'tarja',
    aplicar: (p) => {
      const tarja = (p.tarja ?? {}) as Record<string, unknown> & { tabs?: string[] }
      const tabs = Array.isArray(tarja.tabs) ? tarja.tabs : []
      return {
        ...p,
        tarja: {
          ...tarja,
          tabs:    tabs.includes('personal') ? tabs : [...tabs, 'personal'],
          ver_pii: true,
        } as Permisos[string],
      }
    },
    revertir: (p) => {
      const tarja = (p.tarja ?? {}) as Record<string, unknown> & { tabs?: string[] }
      const tabs = Array.isArray(tarja.tabs) ? tarja.tabs.filter((t: string) => t !== 'personal') : []
      const out: Record<string, unknown> = { ...tarja }
      out.tabs = tabs
      delete out.ver_pii
      return { ...p, tarja: out as Permisos[string] }
    },
  },
  {
    key:   'tarja_lectura_compras',
    label: 'Ver tarja (operación)',
    descripcion: 'Permite a Compras ver el módulo de Tarja en lectura.',
    aplicaA: ['compras'],
    moduloTarget: 'tarja',
    aplicar: (p) => ({
      ...p,
      tarja: {
        ...((p.tarja ?? {}) as Permisos[string]),
        lectura: true, ver_costos: false, ver_pii: false,
      },
    }),
    revertir: (p) => omitTarjaKeys(p, ['lectura', 'ver_costos', 'ver_pii',]),
  },
  {
    key:   'cargar_horas_propias',
    label: 'Cargar horas propias',
    descripcion: 'Habilita módulo Tarja con vista restringida (capataz) y scope "asignadas" SOLO para tarja. El admin debe asignar la obra correspondiente abajo. Caso típico: encargado de depósito que también trabaja físicamente y carga sus horas.',
    // Whitelist amplia: cualquiera que NO sea ya capataz/jefe_obra puro
    // (esos ya cargan horas por su rol). Personalizado se trata aparte
    // en el wizard, donde se ofrece si tarja está tildado.
    aplicaA: ['deposito', 'compras', 'administrativo'],
    moduloTarget: 'tarja',
    aplicar: (p) => ({
      ...p,
      tarja: {
        ...((p.tarja ?? {}) as Permisos[string]),
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:     false,
        ver_pii:        false,
        // Override por módulo: en tarja filtra por usuario_obras (modulo='tarja').
        // Esto NO afecta obras_scope global (que sigue 'todas' para que en
        // certificaciones/etc vea todas las obras).
        obras_scope:    'asignadas',
      },
    }),
    revertir: (p) => omitTarjaKeys(p, [
      'lectura', 'creacion', 'actualizacion', 'eliminacion', 'tabs',
      'ver_costos', 'ver_pii', 'obras_scope',
    ]),
  },
]

export function getAddOn(key: string): AddOn | null {
  return ADDONS.find(a => a.key === key) ?? null
}

/** Si el addon tiene sentido para un rol, según su `rol_base` (no su key). */
export function addonAplicaA(addon: AddOn | null | undefined, rolBase: RolBase | null | undefined): boolean {
  return !!addon && !!rolBase && addon.aplicaA.includes(rolBase)
}

// ─── Inversa: derivar addons desde el state persistido ─────────────────────
//
// Cuando abrimos el modal de edición, no tenemos `addons` en DB (no se
// persiste). Lo derivamos inspeccionando `permisos` según el `rol_base`.

export function deriveAddons(
  rolBase: RolBase | null | undefined,
  permisos: Permisos | undefined | null,
): string[] {
  const tarja = (permisos as Record<string, { lectura?: boolean; creacion?: boolean; tabs?: string[]; obras_scope?: string }> | null | undefined)?.tarja
  const addons: string[] = []

  // jefe_obra + tarja_lectura: tarja en lectura, sin creación.
  // Solo detectable con rol_base — un personalizado puro puede tener
  // tarja en lectura por elección manual sin querer el addon.
  if (rolBase === 'jefe_obra' && tarja?.lectura === true && tarja?.creacion !== true) {
    addons.push('tarja_lectura')
  }

  // jefe_obra + tarja_edicion_jefe: tarja con CRUD (al menos lectura+creación).
  // Mutuamente excluyente con tarja_lectura por la condición de creación.
  if (rolBase === 'jefe_obra' && tarja?.lectura === true && tarja?.creacion === true) {
    addons.push('tarja_edicion_jefe')
  }

  // capataz + tab_personal: tarja con tab 'personal' habilitado.
  if (rolBase === 'capataz' && Array.isArray(tarja?.tabs) && tarja.tabs.includes('personal')) {
    addons.push('tab_personal')
  }

  // compras + tarja_lectura_compras: tarja en lectura.
  if (rolBase === 'compras' && tarja?.lectura === true) {
    addons.push('tarja_lectura_compras')
  }

  // cargar_horas_propias: marca distintiva = `tarja.obras_scope='asignadas'`.
  // Esa setting no se mete por accidente, así que es seguro detectarla
  // incluso en modo Personalizado (rol_base=null), donde el user puede
  // venir de un addon previo o haber compuesto manualmente la misma
  // configuración. Caso típico: Cristian que pasó a Personalizado por
  // necesitar herramientas, conserva el behavior del addon.
  const rolBasesValidos: Array<RolBase | null | undefined> = [
    'deposito', 'compras', 'administrativo', null, undefined,
  ]
  if (rolBasesValidos.includes(rolBase) && tarja?.obras_scope === 'asignadas') {
    addons.push('cargar_horas_propias')
  }

  return addons
}

/**
 * Aplica un rol + lista de add-ons. Devuelve { permisos, modulos }.
 * `preset` puede ser el PresetBase directo (roles del API mapeados con
 * `rolToPreset`) o una key a resolver contra `presets` (default: el seed).
 */
export function aplicarPreset(
  preset:  PresetBase | string,
  addons:  string[] = [],
  presets: PresetBase[] = PRESETS_FALLBACK,
): { permisos: Permisos; modulos: string[] } {
  const base = typeof preset === 'string' ? getPreset(preset, presets) : preset
  if (!base) throw new Error(`Preset desconocido: ${String(preset)}`)

  let permisos: Permisos = JSON.parse(JSON.stringify(base.permisos))
  for (const addonKey of addons) {
    const addon = getAddOn(addonKey)
    if (!addonAplicaA(addon, base.rol_base)) continue
    permisos = addon!.aplicar(permisos)
  }
  return { permisos, modulos: modulosDePermisos(permisos) }
}

/**
 * Serialización canónica (claves ordenadas) para comparar permisos/roles sin
 * depender del orden de inserción. La usan los checks de "sin cambios".
 */
export function canonJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(canonJson).join(',') + ']'
  const rec = obj as Record<string, unknown>
  const keys = Object.keys(rec).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonJson(rec[k])).join(',') + '}'
}
