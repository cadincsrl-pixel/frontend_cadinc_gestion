'use client'

/**
 * Wizard de permisos v2 — reemplaza el dropdown de plantillas + matriz CRUD
 * inline del UsuariosTab.
 *
 * Bloques visibles (no stepper, decisión de UX: admin ve todo de un
 * vistazo y entiende qué está otorgando):
 *
 *   1. **Rol base**: 6 cards (admin + 5 presets + personalizado).
 *   2. **Obras visibles**: radio "todas" / "asignadas". Se auto-setea según
 *      el preset elegido pero el admin puede cambiarlo.
 *   3. **Capacidades extra (add-ons)**: checkboxes filtrados por preset
 *      O — en modo Personalizado — por módulos tildados.
 *   4. **Edición fina (solo personalizado)**: matriz CRUD por módulo +
 *      sub-bloque "Capacidades" (vista_completa, ver_pii, ver_costos,
 *      obras_scope) por módulo.
 *
 * El componente NO maneja `nombre`, `email`, `password`, `activo`, ni la
 * sección de obras asignadas — esos siguen viviendo en `UsuariosTab`.
 *
 * Output: cuando cambia algo, llama a `onChange(updates)` con un patch
 * parcial del form. El parent decide qué hacer (merge, validar, persistir).
 */

import { useMemo } from 'react'
import {
  PRESETS, ADDONS, aplicarPreset, getPreset, getAddOn, computeTipoUsuario,
  type RolBase, type ObrasScope, type AddOn,
} from '@/lib/permisos/plantillas'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import type { Permisos, ModuloPermisos, Accion, Modulo } from '@/types/domain.types'

const ACCIONES: { key: Accion; label: string }[] = [
  { key: 'lectura',       label: 'Ver'      },
  { key: 'creacion',      label: 'Crear'    },
  { key: 'actualizacion', label: 'Editar'   },
  { key: 'eliminacion',   label: 'Eliminar' },
]

// Módulos donde el override `obras_scope` por módulo tiene sentido.
// (Filtran por usuario_obras según `modulo`.)
const MODULOS_CON_OBRAS_SCOPE: ReadonlySet<string> = new Set([
  'tarja', 'certificaciones', 'logistica', 'herramientas',
])

// Toggles secundarios mostrados en el sub-bloque "Capacidades" de cada módulo
// en modo Personalizado. Se muestran SIEMPRE (es modo experto) pero algunos
// solo afectan a ciertos módulos en el código del frontend; los `title` lo
// documentan.
type FlagBoolean = 'vista_completa' | 'ver_pii' | 'ver_costos'
const FLAGS_BOOLEAN: { key: FlagBoolean; label: string; help: string }[] = [
  {
    key: 'vista_completa',
    label: 'Vista completa',
    help: 'Habilita toolbar, tarifas y navegación entre semanas (tarja). Default true.',
  },
  {
    key: 'ver_pii',
    label: 'Ver datos personales (PII)',
    help: 'Permite ver DNI, dirección, teléfono y fecha de nacimiento. Aplica principalmente a tarja.',
  },
  {
    key: 'ver_costos',
    label: 'Ver costos',
    help: 'Muestra precios, totales y tarifas. Aplica a tarja y otros módulos sensibles.',
  },
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

  const isAdmin = rolElegido === 'admin'
  const isPersonalizado = rolElegido === 'personalizado'

  // Add-ons disponibles según el modo:
  // - Preset: filtra por aplicaA.includes(preset).
  // - Personalizado: filtra por moduloTarget incluido en data.modulos
  //   (o sin moduloTarget si "se ofrece siempre"). Permite que un user
  //   custom como Cristian (depósito + herramientas) pueda volver a
  //   tildar "Cargar horas propias" si tiene tarja activa.
  const addonsDisponibles = useMemo<AddOn[]>(() => {
    if (isAdmin) return []
    if (isPersonalizado) {
      return ADDONS.filter(a => !a.moduloTarget || data.modulos.includes(a.moduloTarget))
    }
    return ADDONS.filter(a => a.aplicaA.includes(rolElegido as RolBase))
  }, [isAdmin, isPersonalizado, rolElegido, data.modulos])

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
    // Preservamos los addons que ya estaban tildados Y son compatibles con
    // el nuevo preset. Caso típico: el admin estaba en Personalizado con
    // 'cargar_horas_propias' tildado y cambia a 'Encargado de depósito'
    // (que también lo permite) — no tiene sentido obligarlo a re-tildar.
    const addonsCompatibles = data.addons.filter(k =>
      getAddOn(k)?.aplicaA.includes(opcion.key)
    )
    const { permisos, modulos: mods } = aplicarPreset(opcion.key, addonsCompatibles)
    onChange({
      rol:           'operador',
      rol_base:      opcion.key,
      obras_scope:   preset.obras_scope_default,
      addons:        addonsCompatibles,
      permisos,
      modulos:       mods,
      tipo_usuario:  computeTipoUsuario(opcion.key, addonsCompatibles),
    })
  }

  function toggleAddon(addonKey: string) {
    if (isAdmin) return
    const addon = getAddOn(addonKey)
    if (!addon) return

    const tildado = data.addons.includes(addonKey)
    // Al activar un addon, destildamos los que excluye para evitar combinaciones
    // contradictorias (ej. tarja_lectura ↔ tarja_edicion_jefe).
    const excluidos = !tildado && addon.excluye ? new Set(addon.excluye) : null
    const baseAddons = excluidos
      ? data.addons.filter(k => !excluidos.has(k))
      : data.addons
    const newAddons = tildado
      ? baseAddons.filter(k => k !== addonKey)
      : [...baseAddons, addonKey]

    let newPermisos: Permisos
    if (isPersonalizado) {
      // En personalizado no hay preset al que volver: aplicamos/revertimos
      // sobre los permisos actuales.
      newPermisos = tildado ? addon.revertir(data.permisos) : addon.aplicar(data.permisos)
    } else {
      // Con preset, recomputamos desde cero para mantener idempotencia
      // y borrar correctamente cualquier residuo de un addon ya destildado.
      const result = aplicarPreset(rolElegido as RolBase, newAddons)
      newPermisos = result.permisos
    }
    const newModulos = Object.keys(newPermisos)

    // En este punto ya descartamos isAdmin con el return temprano.
    const tipo = rolElegido !== 'personalizado'
      ? computeTipoUsuario(rolElegido as RolBase, newAddons)
      : 'personalizado'

    onChange({
      addons:       newAddons,
      permisos:     newPermisos,
      modulos:      newModulos,
      tipo_usuario: tipo,
    })
  }

  function cambiarScope(scope: ObrasScope) {
    onChange({ obras_scope: scope })
  }

  // ── Modo personalizado: edición fina de matriz CRUD ────────────

  function togglePermiso(modKey: string, accion: Accion) {
    const modPerm = data.permisos[modKey] ?? {}
    const nuevoPerm: ModuloPermisos = { ...modPerm, [accion]: !modPerm[accion] }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm } })
  }

  function toggleModulo(modKey: string) {
    const tiene = data.modulos.includes(modKey)
    if (tiene) {
      const nuevosPermisos = { ...data.permisos }
      delete nuevosPermisos[modKey]
      // Si el módulo era target de algún addon tildado, también lo destildamos
      // para mantener `data.addons` consistente con `data.permisos`.
      const newAddons = data.addons.filter(k => {
        const a = getAddOn(k)
        return !(a?.moduloTarget === modKey)
      })
      onChange({
        modulos:  data.modulos.filter(m => m !== modKey),
        permisos: nuevosPermisos,
        addons:   newAddons,
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

  function toggleFlag(modKey: string, flag: FlagBoolean) {
    const modPerm = data.permisos[modKey] ?? {}
    const actual = modPerm[flag]
    // Tri-state: undefined (default true) → false → true → undefined.
    let next: boolean | undefined
    if (actual === undefined)      next = false
    else if (actual === false)     next = true
    else                           next = undefined

    const nuevoPerm: ModuloPermisos = { ...modPerm }
    if (next === undefined) {
      delete nuevoPerm[flag]
    } else {
      nuevoPerm[flag] = next
    }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm } })
  }

  function cambiarObrasScopeModulo(modKey: string, value: 'sin-override' | 'todas' | 'asignadas') {
    const modPerm = (data.permisos[modKey] ?? {}) as ModuloPermisos & { obras_scope?: ObrasScope }
    const nuevoPerm: ModuloPermisos & { obras_scope?: ObrasScope } = { ...modPerm }
    if (value === 'sin-override') {
      delete nuevoPerm.obras_scope
    } else {
      nuevoPerm.obras_scope = value
    }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm } })
  }

  // ── Hint contextual: addons que setean obras_scope='asignadas' ────
  //
  // Caso típico: tildás `cargar_horas_propias` en personalizado → el addon
  // pone `tarja.obras_scope = 'asignadas'` pero si el módulo target no
  // está tildado o no hay obras asignadas, el user no va a ver nada.
  const hintsObrasScope = useMemo<string[]>(() => {
    if (!isPersonalizado) return []
    const out: string[] = []
    for (const k of data.addons) {
      const a = getAddOn(k)
      if (!a?.moduloTarget) continue
      // Detección heurística: aplicar(empty) deja `obras_scope='asignadas'`
      // en el módulo target. Lo hacemos sobre {} para no depender del state.
      const probe = a.aplicar({} as Permisos)
      const probeMod = probe[a.moduloTarget] as (ModuloPermisos & { obras_scope?: string }) | undefined
      if (probeMod?.obras_scope === 'asignadas') {
        out.push(`Tildaste "${a.label}". Asegurate de tildar también el módulo "${a.moduloTarget}" y de asignarle obras al usuario.`)
      }
    }
    return out
  }, [isPersonalizado, data.addons])

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Bloque 1: Rol ───────────────────────────────────────── */}
      <section className="bg-azul-light rounded-xl p-3 border border-azul/20">
        <div className="text-xs font-bold text-azul uppercase tracking-wider mb-2">
          1. Rol
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      {!isAdmin && addonsDisponibles.length > 0 && (
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
          {hintsObrasScope.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {hintsObrasScope.map((h, i) => (
                <div
                  key={i}
                  className="text-[11px] text-azul bg-azul-light border border-azul/30 rounded-md px-2 py-1.5"
                >
                  ℹ {h}
                </div>
              ))}
            </div>
          )}
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
              const modPerm = (data.permisos[m.key] ?? {}) as ModuloPermisos & { obras_scope?: ObrasScope }
              const obrasScopeModulo: 'sin-override' | 'todas' | 'asignadas' =
                modPerm.obras_scope === 'todas' ? 'todas'
                : modPerm.obras_scope === 'asignadas' ? 'asignadas'
                : 'sin-override'
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

                      {/* Capacidades secundarias (modo experto) */}
                      <div className="mt-3 pt-2 border-t border-gris">
                        <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                          Capacidades
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {FLAGS_BOOLEAN.map(({ key, label, help }) => {
                            const v = modPerm[key]
                            const estado = v === undefined ? 'default' : v ? 'on' : 'off'
                            const labelEstado =
                              estado === 'default' ? 'auto'
                              : estado === 'on'    ? 'sí'
                              :                      'no'
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleFlag(m.key, key)}
                                title={help}
                                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all
                                  ${estado === 'on'
                                    ? 'bg-verde text-white border-verde'
                                    : estado === 'off'
                                      ? 'bg-rojo text-white border-rojo'
                                      : 'bg-white text-gris-dark border-gris-mid hover:border-azul hover:text-azul'}`}
                              >
                                <span>{label}</span>
                                <span className="opacity-80">[{labelEstado}]</span>
                              </button>
                            )
                          })}
                        </div>

                        {MODULOS_CON_OBRAS_SCOPE.has(m.key) && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span
                              className="text-[10px] font-bold text-gris-dark uppercase tracking-wider"
                              title="Override del scope de obras solo para este módulo. Si elegís 'sin override', se usa el scope global."
                            >
                              Obras (override)
                            </span>
                            <select
                              value={obrasScopeModulo}
                              onChange={e => cambiarObrasScopeModulo(
                                m.key,
                                e.target.value as 'sin-override' | 'todas' | 'asignadas',
                              )}
                              className="text-[11px] border border-gris-mid rounded px-2 py-1 bg-white"
                            >
                              <option value="sin-override">Sin override</option>
                              <option value="todas">Todas</option>
                              <option value="asignadas">Asignadas</option>
                            </select>
                          </div>
                        )}
                      </div>
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

// `computeTipoUsuario` se importa de `lib/permisos/plantillas.ts`
// (su inverso `deriveAddons` también vive ahí).
