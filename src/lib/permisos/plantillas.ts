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
    descripcion: 'Gestión amplia: tarja, logística, certificaciones, ropa, préstamos, configuración. Sin caja.',
    modulos: ['tarja', 'logistica', 'certificaciones', 'ropa', 'prestamos', 'configuracion'],
    permisos: {
      tarja:           { ...fullCRUD, ver_costos: true, ver_pii: true, vista_completa: true },
      logistica:       { ...fullCRUD },
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
    descripcion: 'Solo certificaciones (todas las tabs). Resuelve compras y despachos.',
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
    descripcion: 'Stock interno + stock en proveedores. Resuelve despachos. Ve solicitudes en lectura.',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['stock', 'stock-proveedor', 'solicitudes'],
        resolver_items: true,
        forzar_despacho: true,
      },
    },
    obras_scope_default: 'todas',
  },
  {
    key:   'jefe_obra',
    label: 'Jefe de obra',
    descripcion: 'Crea y gestiona pedidos (solicitudes) de SUS obras. No resuelve compras.',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes'],
      },
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
        vista_completa: false,
      },
    },
    obras_scope_default: 'asignadas',
  },
]

export function getPreset(key: string): PresetBase | null {
  return PRESETS.find(p => p.key === key) ?? null
}

// ─── ADD-ONS opcionales que extienden un preset ────────────────────────────

export interface AddOn {
  key:       string
  label:     string
  descripcion: string
  // Función que aplica el add-on sobre los permisos del preset.
  aplicar: (p: Permisos) => Permisos
  // En qué presets tiene sentido ofrecer este add-on (whitelist).
  aplicaA: RolBase[]
}

export const ADDONS: AddOn[] = [
  {
    key:   'tarja_lectura',
    label: 'Ver tarja (supervisar horas)',
    descripcion: 'Acceso de lectura al módulo Tarja para controlar la carga de horas. Sin edición.',
    aplicaA: ['jefe_obra'],
    aplicar: (p) => ({
      ...p,
      tarja: { lectura: true, tabs: ['tarja'], ver_costos: false, ver_pii: false, vista_completa: true },
    }),
  },
  {
    key:   'tab_personal',
    label: 'Acceso al tab Personal',
    descripcion: 'Permite ver el listado de personal asignado a sus obras (incluye DNI, dirección, teléfono).',
    aplicaA: ['capataz'],
    aplicar: (p) => {
      const tarja = (p.tarja ?? {}) as any
      const tabs = Array.isArray(tarja.tabs) ? tarja.tabs : []
      return {
        ...p,
        tarja: {
          ...tarja,
          tabs:    tabs.includes('personal') ? tabs : [...tabs, 'personal'],
          ver_pii: true,
        },
      }
    },
  },
  {
    key:   'tarja_lectura_compras',
    label: 'Ver tarja (operación)',
    descripcion: 'Permite a Compras ver el módulo de Tarja en lectura.',
    aplicaA: ['compras'],
    aplicar: (p) => ({
      ...p,
      tarja: { lectura: true, ver_costos: false, ver_pii: false, vista_completa: true },
    }),
  },
  {
    key:   'cargar_horas_propias',
    label: 'Cargar horas propias',
    descripcion: 'Habilita módulo Tarja con vista restringida (capataz) y scope "asignadas" SOLO para tarja. El admin debe asignar la obra correspondiente abajo. Caso típico: encargado de depósito que también trabaja físicamente y carga sus horas.',
    aplicaA: ['deposito', 'compras', 'administrativo'],
    aplicar: (p) => ({
      ...p,
      tarja: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:     false,
        ver_pii:        false,
        vista_completa: false,
        // Override por módulo: en tarja filtra por usuario_obras (modulo='tarja').
        // Esto NO afecta obras_scope global (que sigue 'todas' para que en
        // certificaciones/etc vea todas las obras).
        obras_scope:    'asignadas',
      },
    }),
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
  if (!rolBase) return []
  const tarja = (permisos as Record<string, { lectura?: boolean; creacion?: boolean; tabs?: string[]; obras_scope?: string }> | null | undefined)?.tarja
  const addons: string[] = []

  // jefe_obra + tarja_lectura: tarja en lectura, sin creación.
  if (rolBase === 'jefe_obra' && tarja?.lectura === true && tarja?.creacion !== true) {
    addons.push('tarja_lectura')
  }

  // capataz + tab_personal: tarja con tab 'personal' habilitado.
  if (rolBase === 'capataz' && Array.isArray(tarja?.tabs) && tarja.tabs.includes('personal')) {
    addons.push('tab_personal')
  }

  // compras + tarja_lectura_compras: tarja en lectura.
  if (rolBase === 'compras' && tarja?.lectura === true) {
    addons.push('tarja_lectura_compras')
  }

  // deposito/compras/administrativo + cargar_horas_propias: tarja con
  // override `obras_scope='asignadas'` (marca distintiva del addon).
  if (
    (rolBase === 'deposito' || rolBase === 'compras' || rolBase === 'administrativo') &&
    tarja?.obras_scope === 'asignadas'
  ) {
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
