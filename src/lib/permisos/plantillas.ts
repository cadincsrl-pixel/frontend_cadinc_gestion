/**
 * Sistema de roles v2 — 5 presets base + add-ons opcionales.
 *
 * Cada usuario tiene:
 * - Un `rol_base` (uno de los 5 abajo, o admin que bypaseaa todo).
 * - Un `obras_scope` ('todas' o 'asignadas').
 * - Add-ons opcionales que extienden capabilities (ver_costos, ver_pii, etc.).
 *
 * La UI ofrece "wizard" en 4 pasos: rol → obras_scope → add-ons → asignar
 * obras (si scope=asignadas). Si admin edita permisos a mano, el rol_base
 * NO cambia y se muestra badge "modificado" comparando contra el preset.
 *
 * Compat: el array PLANTILLAS legacy se mantiene durante la transición
 * para que el dropdown viejo siga funcionando.
 */
import type { Permisos } from '@/types/domain.types'

// ─── PRESETS BASE v2 ──────────────────────────────────────────────────────────

export type RolBase = 'administrativo' | 'compras' | 'deposito' | 'jefe_obra' | 'capataz'
export type ObrasScope = 'todas' | 'asignadas'

export interface PresetBase {
  key:               RolBase
  label:             string
  descripcion:       string
  modulos:           string[]
  permisos:          Permisos
  obras_scope_default: ObrasScope
}

const fullCRUD = { lectura: true, creacion: true, actualizacion: true, eliminacion: true }

export const PRESETS: PresetBase[] = [
  {
    key:   'administrativo',
    label: 'Administrativo',
    descripcion: 'Gestión amplia: tarja, logística, compras y stock, ropa, préstamos, configuración, caja, flota. Casi-admin sin permisos de usuarios/permisos.',
    modulos: ['tarja', 'logistica', 'certificaciones', 'ropa', 'prestamos', 'configuracion', 'caja', 'flota'],
    permisos: {
      tarja:           { ...fullCRUD, ver_costos: true, ver_pii: true, administrar_obras: true },
      logistica:       { ...fullCRUD },
      caja:            { ...fullCRUD },
      flota:           { ...fullCRUD },
      certificaciones: { ...fullCRUD, resolver_items: true, forzar_despacho: true },
      ropa:            { ...fullCRUD },
      prestamos:       { ...fullCRUD },
      configuracion:   { ...fullCRUD },
    },
    obras_scope_default: 'todas',
  },
  {
    key:   'compras',
    label: 'Compras',
    descripcion: 'Solo Compras y Stock (todas las tabs). Resuelve compras y despachos.',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes', 'stock', 'stock-proveedor', 'materiales', 'adicionales', 'costos'],
        resolver_items: true,
        forzar_despacho: true,
      },
    },
    obras_scope_default: 'todas',
  },
  {
    key:   'deposito',
    label: 'Encargado de depósito',
    descripcion: 'Stock interno + stock en proveedores + herramientas. Resuelve despachos. Ve solicitudes en lectura.',
    modulos: ['certificaciones', 'herramientas'],
    permisos: {
      certificaciones: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['stock', 'stock-proveedor', 'solicitudes'],
        resolver_items: true,
        forzar_despacho: true,
      },
      herramientas: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        // Excluye 'parametros' para mantener configuración de tipos/categorías
        // como territorio admin.
        tabs: ['inventario', 'movimientos', 'trazabilidad'],
      },
    },
    obras_scope_default: 'todas',
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
  },
]

export function getPreset(key: string): PresetBase | null {
  return PRESETS.find(p => p.key === key) ?? null
}

// ─── ADD-ONS opcionales que extienden un preset ────────────────────────────
//
// Cada addon expone:
//   - aplicar(p)  : agrega o setea las claves que el addon controla.
//   - revertir(p) : el inverso. Borra esas mismas claves o restaura
//                   defaults del preset/personalizado. NO usa state
//                   externo: solo mira `p` y deshace lo que `aplicar`
//                   habría agregado.
//   - aplicaA     : whitelist de presets donde tiene sentido. Si el
//                   user está en modo Personalizado (rol_base=null),
//                   el wizard ofrece addons cuyo módulo target esté
//                   tildado. La validación final la hace el handler
//                   del onChange.

export interface AddOn {
  key:       string
  label:     string
  descripcion: string
  aplicar:    (p: Permisos) => Permisos
  revertir:   (p: Permisos) => Permisos
  aplicaA:   RolBase[]
  // Módulo cuya activación habilita el addon en modo Personalizado.
  // Si el user está en Personalizado, el wizard ofrece este addon
  // SOLO cuando ese módulo está tildado en `data.modulos`. Si queda
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
    // (esos ya cargan horas por su preset). Personalizado se trata aparte
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

// ─── Inversas: derivar addons / tipo_usuario desde el state persistido ──
//
// Cuando abrimos el modal de edición, no tenemos `addons` en DB (no se
// persiste). Lo derivamos inspeccionando `permisos`. Y al guardar,
// computamos el `tipo_usuario` legacy para el badge de la tabla y para
// queries que aún lo usen.
//
// Ambas funciones DEBEN seguir como inversas: si `deriveAddons` mapea
// (rolBase, permisos) → ['X'], entonces `computeTipoUsuario(rolBase, ['X'])`
// debe devolver el tipo legacy correspondiente. Las pongo juntas para que
// el drift sea visible cuando se modifica una sin la otra.

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

// Mapeo preset+addons → tipo_usuario legacy. Solo se conocen los combos
// históricos; combos nuevos (compras+tarja_lectura, deposito+cargar_horas)
// devuelven el rolBase puro y el badge muestra los addons aparte.
export function computeTipoUsuario(rolBase: RolBase, addons: string[]): string {
  if (rolBase === 'jefe_obra' && addons.includes('tarja_lectura')) {
    return 'jefe_obra_supervisor'
  }
  if (rolBase === 'capataz' && addons.includes('tab_personal')) {
    return 'capataz_supervisor'
  }
  return rolBase
}

// Aplica un preset + lista de add-ons. Devuelve { permisos, modulos }.
export function aplicarPreset(
  presetKey: RolBase,
  addons: string[] = [],
): { permisos: Permisos; modulos: string[] } {
  const preset = getPreset(presetKey)
  if (!preset) throw new Error(`Preset desconocido: ${presetKey}`)

  let permisos: Permisos = JSON.parse(JSON.stringify(preset.permisos))
  for (const addonKey of addons) {
    const addon = getAddOn(addonKey)
    if (!addon || !addon.aplicaA.includes(presetKey)) continue
    permisos = addon.aplicar(permisos)
  }
  // modulos derivado de las keys de permisos.
  const modulos = Object.keys(permisos)
  return { permisos, modulos }
}

// ─── COMPAT LEGACY ────────────────────────────────────────────────────────────
// Las "plantillas" viejas se mantienen para que el UsuariosTab actual siga
// funcionando hasta que se reemplace por el wizard nuevo.

export interface Plantilla {
  key:                 string
  label:               string
  descripcion:         string
  rol:                 'admin' | 'operador'
  modulos:             string[]
  permisos:            Permisos
  obras_restringidas:  boolean
}

export const PLANTILLAS: Plantilla[] = [
  // Mapeo 1:1 con presets.
  ...PRESETS.map(p => ({
    key:   p.key,
    label: p.label,
    descripcion: p.descripcion,
    rol:   'operador' as const,
    modulos: p.modulos,
    permisos: p.permisos,
    obras_restringidas: p.obras_scope_default === 'asignadas',
  })),
  // Combinaciones que existen en DB (Candela, Cristian futuro).
  // Internamente son preset+addon, pero la UI vieja las trata como plantilla.
  {
    key:   'jefe_obra_supervisor',
    label: 'Jefe de obra + supervisor',
    descripcion: 'Jefe de obra + ver tarja para supervisar (lectura).',
    rol:   'operador',
    modulos: aplicarPreset('jefe_obra', ['tarja_lectura']).modulos,
    permisos: aplicarPreset('jefe_obra', ['tarja_lectura']).permisos,
    obras_restringidas: true,
  },
  {
    key:   'capataz_supervisor',
    label: 'Capataz + perfiles de personal',
    descripcion: 'Capataz + acceso al tab Personal con PII completa.',
    rol:   'operador',
    modulos: aplicarPreset('capataz', ['tab_personal']).modulos,
    permisos: aplicarPreset('capataz', ['tab_personal']).permisos,
    obras_restringidas: true,
  },
]

export function getPlantilla(key: string): Plantilla | null {
  return PLANTILLAS.find(p => p.key === key) ?? null
}

export function permisosMatchPlantilla(
  permisos: Permisos | undefined | null,
  rol: 'admin' | 'operador',
  modulos: string[],
  plantillaKey: string,
): boolean {
  const p = getPlantilla(plantillaKey)
  if (!p) return false
  if (p.rol !== rol) return false
  if (!sameSet(p.modulos, modulos)) return false
  return canon(permisos ?? {}) === canon(p.permisos)
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function canon(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(canon).join(',') + ']'
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(obj[k])).join(',') + '}'
}
