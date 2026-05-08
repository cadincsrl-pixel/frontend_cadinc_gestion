'use client'

/**
 * Wizard de permisos v2 — reemplaza el dropdown de plantillas + matriz CRUD
 * inline del UsuariosTab.
 *
 * Tres bloques visibles (no stepper, decisión de UX: admin ve todo de un
 * vistazo y entiende qué está otorgando):
 *
 *   1. **Rol base**: 6 cards (admin + 5 presets + personalizado).
 *   2. **Obras visibles**: radio "todas" / "asignadas". Se auto-setea según
 *      el preset elegido pero el admin puede cambiarlo.
 *   3. **Capacidades extra (add-ons)**: checkboxes filtrados por preset.
 *      Solo aparecen los add-ons aplicables al rol elegido.
 *
 * Si el admin elige "Personalizado", aparece adicionalmente un cuarto bloque
 * con la matriz CRUD por módulo (legacy) para edición fina.
 *
 * El componente NO maneja `nombre`, `email`, `password`, `activo`, ni la
 * sección de obras asignadas — esos siguen viviendo en `UsuariosTab`.
 *
 * Output: cuando cambia algo, llama a `onChange(updates)` con un patch
 * parcial del form. El parent decide qué hacer (merge, validar, persistir).
 */

import { useMemo } from 'react'
import {
  PRESETS, ADDONS, aplicarPreset, getPreset,
  type RolBase, type ObrasScope,
} from '@/lib/permisos/plantillas'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import type { Permisos, Accion, Modulo } from '@/types/domain.types'

const ACCIONES: { key: Accion; label: string }[] = [
  { key: 'lectura',       label: 'Ver'      },
  { key: 'creacion',      label: 'Crear'    },
  { key: 'actualizacion', label: 'Editar'   },
  { key: 'eliminacion',   label: 'Eliminar' },
]

// El estado del wizard. El parent puede tener más campos (nombre, email…)
// pero el wizard solo lee/escribe estos.
export interface WizardData {
  rol:          'admin' | 'operador'
  rol_base:     RolBase | null     // null = personalizado
  obras_scope:  ObrasScope
  addons:       string[]
  modulos:      string[]
  permisos:     Permisos
  // Compat legacy: el endpoint sigue persistiendo `tipo_usuario` para que
  // los reportes/queries viejos no rompan. Lo computamos al guardar.
  tipo_usuario?: string | null
}

export type WizardPatch = Partial<WizardData>

interface Props {
  data:    WizardData
  onChange: (patch: WizardPatch) => void
  modulos:  Modulo[]
}

// Cards de elección de rol (incluye admin y personalizado, además de los 5 presets).
type RolOpcion =
  | { kind: 'admin' }
  | { kind: 'personalizado' }
  | { kind: 'preset'; key: RolBase; label: string; descripcion: string }

const OPCIONES_ROL: RolOpcion[] = [
  { kind: 'admin' },
  ...PRESETS.map(p => ({ kind: 'preset' as const, key: p.key, label: p.label, descripcion: p.descripcion })),
  { kind: 'personalizado' },
]

export function PermisosWizard({ data, onChange, modulos }: Props) {
  // Derivar el "estado" del rol elegido para pintar la UI.
  const rolElegido: 'admin' | RolBase | 'personalizado' = data.rol === 'admin'
    ? 'admin'
    : data.rol_base ?? 'personalizado'

  // Add-ons disponibles para el preset actual (si hay preset).
  const addonsDisponibles = useMemo(() => {
    if (rolElegido === 'admin' || rolElegido === 'personalizado') return []
    return ADDONS.filter(a => a.aplicaA.includes(rolElegido as RolBase))
  }, [rolElegido])

  // ── Handlers ────────────────────────────────────────────────────

  function elegirRol(opcion: RolOpcion) {
    if (opcion.kind === 'admin') {
      onChange({
        rol:           'admin',
        rol_base:      null,
        obras_scope:   'todas',
        addons:        [],
        modulos:       [],
        permisos:      {},
        tipo_usuario:  null,
      })
      return
    }
    if (opcion.kind === 'personalizado') {
      onChange({
        rol:           'operador',
        rol_base:      null,
        // Mantengo el scope actual (o 'todas' por default).
        obras_scope:   data.obras_scope ?? 'todas',
        addons:        [],
        // No tocamos permisos/modulos: el admin edita la matriz a mano.
        tipo_usuario:  'personalizado',
      })
      return
    }
    // Preset.
    const preset = getPreset(opcion.key)!
    const { permisos, modulos: mods } = aplicarPreset(opcion.key, [])
    onChange({
      rol:           'operador',
      rol_base:      opcion.key,
      obras_scope:   preset.obras_scope_default,
      addons:        [],
      permisos,
      modulos:       mods,
      tipo_usuario:  opcion.key,
    })
  }

  function toggleAddon(addonKey: string) {
    if (rolElegido === 'admin' || rolElegido === 'personalizado') return
    const addons = data.addons.includes(addonKey)
      ? data.addons.filter(k => k !== addonKey)
      : [...data.addons, addonKey]
    const { permisos, modulos: mods } = aplicarPreset(rolElegido as RolBase, addons)
    // Calcular tipo_usuario para back-compat (matchea plantillas legacy).
    const tipo = computeTipoUsuario(rolElegido as RolBase, addons)
    onChange({ addons, permisos, modulos: mods, tipo_usuario: tipo })
  }

  function cambiarScope(scope: ObrasScope) {
    onChange({ obras_scope: scope })
  }

  // ── Modo personalizado: edición fina de matriz CRUD ────────────

  function togglePermiso(modKey: string, accion: Accion) {
    const modPerm = data.permisos[modKey] ?? {}
    const nuevoPerm = { ...modPerm, [accion]: !modPerm[accion] }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm } })
  }

  function toggleModulo(modKey: string) {
    const tiene = data.modulos.includes(modKey)
    if (tiene) {
      const nuevosPermisos = { ...data.permisos }
      delete nuevosPermisos[modKey]
      onChange({
        modulos:  data.modulos.filter(m => m !== modKey),
        permisos: nuevosPermisos,
      })
    } else {
      onChange({
        modulos:  [...data.modulos, modKey],
        permisos: { ...data.permisos, [modKey]: data.permisos[modKey] ?? {} },
      })
    }
  }

  function toggleTab(modKey: string, tabKey: string) {
    const modPerm = data.permisos[modKey] ?? {}
    const tabsActuales = modPerm.tabs ?? []
    const allTabs = TABS_POR_MODULO[modKey]?.map(t => t.key) ?? []
    let newTabs: string[]
    if (tabsActuales.length === 0) {
      newTabs = allTabs.filter(t => t !== tabKey)
    } else if (tabsActuales.includes(tabKey)) {
      newTabs = tabsActuales.filter(t => t !== tabKey)
    } else {
      newTabs = [...tabsActuales, tabKey]
    }
    if (newTabs.length === allTabs.length) newTabs = [] // "todos"
    onChange({
      permisos: { ...data.permisos, [modKey]: { ...modPerm, tabs: newTabs } },
    })
  }

  // ── Render ──────────────────────────────────────────────────────

  const isAdmin = rolElegido === 'admin'
  const isPersonalizado = rolElegido === 'personalizado'

  return (
    <div className="flex flex-col gap-4">

      {/* ── Bloque 1: Rol ───────────────────────────────────────── */}
      <section className="bg-azul-light rounded-xl p-3 border border-azul/20">
        <div className="text-xs font-bold text-azul uppercase tracking-wider mb-2">
          1. Rol
        </div>
        <div className="grid grid-cols-2 gap-2">
          {OPCIONES_ROL.map(op => {
            const key = op.kind === 'admin' ? 'admin' : op.kind === 'personalizado' ? 'personalizado' : op.key
            const elegido = key === rolElegido
            const label = op.kind === 'admin'
              ? '⭐ Administrador'
              : op.kind === 'personalizado'
                ? '⚙ Personalizado'
                : op.label
            const desc = op.kind === 'admin'
              ? 'Acceso total al sistema, todos los módulos.'
              : op.kind === 'personalizado'
                ? 'Edición manual de módulos y permisos.'
                : op.descripcion
            return (
              <button
                key={key}
                type="button"
                onClick={() => elegirRol(op)}
                className={`
                  text-left rounded-lg border-[1.5px] p-3 transition-all
                  ${elegido
                    ? op.kind === 'admin'
                      ? 'bg-[#EEE8FF] border-[#5A2D82]'
                      : 'bg-naranja-light border-naranja'
                    : 'bg-white border-gris-mid hover:border-gris-dark'
                  }
                `}
              >
                <div className="font-bold text-sm text-carbon">{label}</div>
                <div className="text-[11px] text-gris-dark mt-0.5">{desc}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Bloque 2: Obras visibles ────────────────────────────── */}
      {!isAdmin && (
        <section className="bg-white rounded-xl p-3 border border-gris-mid">
          <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
            2. Obras visibles
          </div>
          <div className="flex flex-col gap-2">
            <label className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border-[1.5px]
              ${data.obras_scope === 'todas' ? 'border-naranja bg-naranja-light' : 'border-gris-mid bg-white hover:bg-gris/40'}`}>
              <input
                type="radio"
                checked={data.obras_scope === 'todas'}
                onChange={() => cambiarScope('todas')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-bold text-carbon">Todas las obras</div>
                <div className="text-[11px] text-gris-dark">El usuario ve y opera en todas las obras de la empresa.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border-[1.5px]
              ${data.obras_scope === 'asignadas' ? 'border-naranja bg-naranja-light' : 'border-gris-mid bg-white hover:bg-gris/40'}`}>
              <input
                type="radio"
                checked={data.obras_scope === 'asignadas'}
                onChange={() => cambiarScope('asignadas')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-bold text-carbon">Solo obras asignadas</div>
                <div className="text-[11px] text-gris-dark">Solo ve las obras que le asignes en la sección de abajo.</div>
              </div>
            </label>
          </div>
        </section>
      )}

      {/* ── Bloque 3: Capacidades extra ─────────────────────────── */}
      {!isAdmin && !isPersonalizado && addonsDisponibles.length > 0 && (
        <section className="bg-white rounded-xl p-3 border border-gris-mid">
          <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
            3. Capacidades extra
          </div>
          <div className="flex flex-col gap-2">
            {addonsDisponibles.map(addon => {
              const checked = data.addons.includes(addon.key)
              return (
                <label
                  key={addon.key}
                  className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border-[1.5px]
                    ${checked ? 'border-naranja bg-naranja-light' : 'border-gris-mid bg-white hover:bg-gris/40'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAddon(addon.key)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-bold text-carbon">{addon.label}</div>
                    <div className="text-[11px] text-gris-dark">{addon.descripcion}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Bloque 4: edición fina (solo personalizado) ─────────── */}
      {isPersonalizado && (
        <section className="bg-white rounded-xl p-3 border border-gris-mid">
          <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
            Módulos y permisos
          </div>
          <div className="text-[11px] text-gris-dark mb-3">
            Modo personalizado: tildá los módulos y las acciones que el usuario puede hacer en cada uno.
          </div>
          <div className="flex flex-col gap-3">
            {modulos.map(m => {
              const tiene = data.modulos.includes(m.key)
              const modPerm = data.permisos[m.key] ?? {}
              return (
                <div
                  key={m.key}
                  className={`rounded-xl border-[1.5px] overflow-hidden transition-all
                    ${tiene ? 'border-naranja' : 'border-gris-mid'}`}
                >
                  <label className={`flex items-center gap-3 p-3 cursor-pointer
                    ${tiene ? 'bg-naranja-light' : 'bg-white hover:bg-gris/40'}`}>
                    <input
                      type="checkbox"
                      checked={tiene}
                      onChange={() => toggleModulo(m.key)}
                      className="accent-naranja w-4 h-4"
                    />
                    <span className="text-2xl">{m.icono}</span>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-carbon">{m.nombre}</div>
                      <div className="text-xs text-gris-dark">{m.descripcion}</div>
                    </div>
                  </label>
                  {tiene && (
                    <div className="px-3 pb-3 pt-1 bg-white border-t border-naranja/20">
                      <div className="flex gap-2 flex-wrap">
                        {ACCIONES.map(({ key, label }) => {
                          const activo = modPerm[key] === true
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => togglePermiso(m.key, key)}
                              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-[1.5px] transition-all
                                ${activo
                                  ? 'bg-azul text-white border-azul'
                                  : 'bg-white text-gris-dark border-gris-mid hover:border-azul hover:text-azul'}`}
                            >
                              <span>{activo ? '✓' : '○'}</span>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      {TABS_POR_MODULO[m.key] && (
                        <div className="mt-3 pt-2 border-t border-gris">
                          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                            Secciones visibles
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {TABS_POR_MODULO[m.key]!.map(tab => {
                              const tabsActuales = modPerm.tabs ?? []
                              const tabActivo = tabsActuales.length === 0 || tabsActuales.includes(tab.key)
                              return (
                                <button
                                  key={tab.key}
                                  type="button"
                                  onClick={() => toggleTab(m.key, tab.key)}
                                  className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all
                                    ${tabActivo
                                      ? 'bg-naranja text-white border-naranja'
                                      : 'bg-white text-gris-dark border-gris-mid hover:border-naranja hover:text-naranja'}`}
                                >
                                  <span>{tab.icon}</span>
                                  {tab.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Resumen del rol elegido (informativo, especialmente para presets) */}
      {!isAdmin && !isPersonalizado && (
        <div className="bg-gris/40 rounded-lg p-2.5 text-[11px] text-gris-dark">
          <span className="font-bold">Módulos otorgados:</span>{' '}
          {data.modulos.length === 0 ? '—' : data.modulos.join(', ')}
        </div>
      )}
    </div>
  )
}

// ─── Helper: derivar tipo_usuario legacy desde preset+addons ──────
//
// Mantiene compat con queries y reportes que filtran por `tipo_usuario`.
// Cuando una combinación preset+addon coincide con una plantilla legacy
// conocida, devolvemos esa key. Si no, devolvemos el preset solo.
//
// Importante: este helper es el INVERSO de `deriveAddons` en UsuariosTab.
// Si agregás un addon nuevo que tenga combo legacy, actualizá ambos en par.
function computeTipoUsuario(rolBase: RolBase, addons: string[]): string {
  if (rolBase === 'jefe_obra' && addons.includes('tarja_lectura')) {
    return 'jefe_obra_supervisor'
  }
  if (rolBase === 'capataz' && addons.includes('tab_personal')) {
    return 'capataz_supervisor'
  }
  return rolBase
}
