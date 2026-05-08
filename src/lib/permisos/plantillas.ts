/**
 * Plantillas de permisos por tipo de usuario.
 *
 * Aplicar una plantilla setea rol + módulos + permisos. El usuario admin
 * NO usa plantilla (su rol implica acceso total). Si después de aplicar
 * una plantilla el admin edita permisos a mano, `tipo_usuario` queda en
 * 'personalizado' para reflejarlo.
 *
 * `obras_restringidas: true` significa que el rol DEBE tener obras
 * asignadas (jefe de obra, capataz). El backend filtra automáticamente
 * las obras visibles para esos usuarios.
 */
import type { Permisos } from '@/types/domain.types'

export interface Plantilla {
  key:                 string
  label:               string
  descripcion:         string
  rol:                 'admin' | 'operador'
  modulos:             string[]
  permisos:            Permisos
  obras_restringidas:  boolean
}

const fullCRUD = { lectura: true, creacion: true, actualizacion: true, eliminacion: true }

export const PLANTILLAS: Plantilla[] = [
  {
    key:   'administrativo',
    label: 'Administrativo',
    descripcion: 'Acceso amplio: tarja, logística, certificaciones, ropa, préstamos, configuración. Sin caja.',
    rol:   'operador',
    modulos: ['tarja', 'logistica', 'certificaciones', 'ropa', 'prestamos', 'configuracion'],
    permisos: {
      tarja:           { ...fullCRUD },
      logistica:       { ...fullCRUD },
      certificaciones: { ...fullCRUD, resolver_items: true, forzar_despacho: true },
      ropa:            { ...fullCRUD },
      prestamos:       { ...fullCRUD },
      configuracion:   { ...fullCRUD },
    },
    obras_restringidas: false,
  },
  {
    key:   'compras',
    label: 'Compras',
    descripcion: 'Solo certificaciones (todas las tabs): solicitudes, stock, proveedores, materiales, costos, adicionales.',
    rol:   'operador',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes', 'stock', 'stock-proveedor', 'materiales', 'adicionales', 'costos'],
        resolver_items: true,
        forzar_despacho: true,
      },
    },
    obras_restringidas: false,
  },
  {
    key:   'encargado_deposito',
    label: 'Encargado de depósito',
    descripcion: 'Stock interno + stock en proveedores. Ve solicitudes en lectura para saber qué se está pidiendo.',
    rol:   'operador',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['stock', 'stock-proveedor', 'solicitudes'],
        resolver_items: true,
        forzar_despacho: true,
      },
    },
    obras_restringidas: false,
  },
  {
    key:   'jefe_obra',
    label: 'Jefe de obra',
    descripcion: 'Solo crea y gestiona pedidos de materiales (solicitudes) de SUS obras. No resuelve compras ni despachos.',
    rol:   'operador',
    modulos: ['certificaciones'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes'],
      },
    },
    obras_restringidas: true,
  },
  {
    key:   'jefe_obra_supervisor',
    label: 'Jefe de obra + supervisor',
    descripcion: 'Jefe de obra (gestiona pedidos) Y supervisor de tarja: solo lectura, navega semanas para controlar quiénes trabajaron y horas cargadas. No ve costos.',
    rol:   'operador',
    modulos: ['certificaciones', 'tarja'],
    permisos: {
      certificaciones: {
        ...fullCRUD,
        tabs: ['solicitudes'],
      },
      tarja: {
        lectura: true,
        tabs: ['tarja'],
        ver_costos: false,
      },
    },
    obras_restringidas: true,
  },
  {
    key:   'capataz',
    label: 'Capataz',
    descripcion: 'Solo carga horas de la semana actual de SU obra. No ve precios, no edita personal ni cierres.',
    rol:   'operador',
    modulos: ['tarja'],
    permisos: {
      tarja: {
        lectura: true, creacion: true, actualizacion: true, eliminacion: false,
        tabs: ['tarja'],
        ver_costos:       false,
        solo_carga_horas: true,
      },
    },
    obras_restringidas: true,
  },
]

export function getPlantilla(key: string): Plantilla | null {
  return PLANTILLAS.find(p => p.key === key) ?? null
}

/**
 * Compara los permisos actuales con los de la plantilla declarada en
 * `tipo_usuario`. Devuelve `true` si coinciden — sino, el usuario fue
 * editado manualmente y la UI debería mostrar "Personalizado".
 *
 * Se usa para decidir si seguir mostrando el tipo guardado o cambiarlo
 * a 'personalizado'. Comparación profunda simple por JSON.stringify
 * ordenando keys.
 */
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
  // Serializa con keys ordenadas a todos los niveles.
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(canon).join(',') + ']'
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(obj[k])).join(',') + '}'
}
