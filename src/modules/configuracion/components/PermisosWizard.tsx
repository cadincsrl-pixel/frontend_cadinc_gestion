'use client'

/**
 * Wizard de permisos v2 — reemplaza el dropdown de plantillas + matriz CRUD
 * inline del UsuariosTab.
 *
 * Bloques visibles (no stepper, decisión de UX: admin ve todo de un
 * vistazo y entiende qué está otorgando):
 *
 *   1. **Rol**: cards admin + roles de la tabla `roles` (activos, por orden;
 *      mientras carga el API se muestra el seed `PRESETS_FALLBACK`) +
 *      personalizado.
 *   2. **Obras visibles**: radio "todas" / "asignadas". Se auto-setea según
 *      el rol elegido pero el admin puede cambiarlo.
 *   3. **Capacidades extra (add-ons)**: checkboxes filtrados por el
 *      `rol_base` del rol O — en modo Personalizado — por módulos tildados.
 *   4. **Edición fina (solo personalizado)**: matriz CRUD por módulo +
 *      sub-bloque "Capacidades" (ver_pii, ver_costos, administrar_obras,
 *      resolver_items, forzar_despacho…) por módulo.
 *
 * `personalizado`: al elegir un rol queda en false (el usuario sigue al rol y
 * "Aplicar rol" lo actualiza). Pasa a true al elegir Personalizado, al tocar
 * la matriz/tabs/flags o al tildar un add-on (con add-ons los permisos ya
 * difieren del rol: si "Aplicar rol" los pisara, el usuario perdería p.ej.
 * su acceso a tarja). `rol_key` se conserva en Personalizado para saber de
 * qué rol partió.
 *
 * El componente NO maneja `nombre`, `email`, `password`, `activo`, ni la
 * sección de obras asignadas — esos siguen viviendo en `UsuariosTab`.
 *
 * Output: cuando cambia algo, llama a `onChange(updates)` con un patch
 * parcial del form. El parent decide qué hacer (merge, validar, persistir).
 * Ya no emite `modulos` (el backend lo deriva de `permisos`) ni `tipo_usuario`.
 */

import { useMemo, useState } from 'react'
import {
  PRESETS_FALLBACK, ADDONS, aplicarPreset, getAddOn, addonAplicaA, rolToPreset, modulosDePermisos, canonJson,
  type PresetBase, type RolBase, type ObrasScope, type AddOn,
} from '@/lib/permisos/plantillas'
import { ACCIONES, FLAGS_BOOLEAN, MODULOS_CON_OBRAS_SCOPE, type FlagBoolean } from '@/lib/permisos/flags'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { useRoles, rolesActivos } from '../hooks/useRoles'
import type { Permisos, ModuloPermisos, Accion, Modulo } from '@/types/domain.types'

// El estado del wizard. El parent puede tener más campos (nombre, email…)
// pero el wizard solo lee/escribe estos.
export interface WizardData {
  rol:           'admin' | 'operador'
  rol_key:       string | null      // rol del que parte; null = admin o personalizado puro
  rol_base:      RolBase | null     // identidad que usa el backend (capataz / jefe_obra)
  personalizado: boolean            // true = ajustes propios; "Aplicar rol" no lo pisa
  obras_scope:   ObrasScope
  addons:        string[]
  permisos:      Permisos
}

export type WizardPatch = Partial<WizardData>

interface Props {
  data:    WizardData
  onChange: (patch: WizardPatch) => void
  modulos:  Modulo[]
}

// Cards de elección de rol (incluye admin y personalizado, además de los roles).
type RolOpcion =
  | { kind: 'admin' }
  | { kind: 'personalizado' }
  | { kind: 'rol'; preset: PresetBase; inactivo?: boolean }

export function PermisosWizard({ data, onChange, modulos }: Props) {
  const { data: roles } = useRoles()

  // Roles del API (activos, por orden). Mientras carga —o si el endpoint
  // falla— caemos al seed en código para que el modal no quede sin opciones.
  const presets = useMemo<PresetBase[]>(
    () => (roles ? rolesActivos(roles).map(rolToPreset) : PRESETS_FALLBACK),
    [roles],
  )

  // El admin eligió la card "Personalizado" en esta sesión del modal (estado
  // de UI: hasta que edite algo, sus permisos siguen coincidiendo con el rol
  // y no alcanzaría con mirar `personalizado`).
  const [modoManual, setModoManual] = useState(false)

  const presetDelRol = useMemo<PresetBase | null>(
    () => (data.rol_key ? presets.find(p => p.key === data.rol_key) ?? null : null),
    [presets, data.rol_key],
  )
  // "Rol + add-ons" se muestra en modo rol (card del rol + add-ons tildados)
  // aunque `personalizado` sea true, si los permisos coinciden exactamente con
  // aplicar el rol con esos add-ons. Si además hubo ediciones manuales, cae a
  // Personalizado con la matriz.
  const coincideConRol = useMemo(() => {
    if (!presetDelRol) return false
    return canonJson(aplicarPreset(presetDelRol, data.addons).permisos) === canonJson(data.permisos)
  }, [presetDelRol, data.addons, data.permisos])

  // Derivar el "estado" del rol elegido para pintar la UI.
  const isAdmin = data.rol === 'admin'
  const isPersonalizado = !isAdmin && (!data.rol_key || modoManual || (data.personalizado && !coincideConRol))
  const presetActual = !isAdmin && !isPersonalizado ? presetDelRol : null
  const rolElegido: string = isAdmin ? 'admin' : isPersonalizado ? 'personalizado' : (data.rol_key ?? 'personalizado')

  const opciones = useMemo<RolOpcion[]>(() => {
    const out: RolOpcion[] = [
      { kind: 'admin' },
      ...presets.map(p => ({ kind: 'rol' as const, preset: p })),
    ]
    // Rol elegido que ya no está activo (o que el API no devolvió): lo
    // mostramos igual para que el admin vea de qué parte y pueda cambiarlo.
    if (!isAdmin && !isPersonalizado && data.rol_key && !presets.some(p => p.key === data.rol_key)) {
      const rolInactivo = roles?.find(r => r.key === data.rol_key)
      out.push({
        kind: 'rol',
        inactivo: true,
        preset: rolInactivo ? rolToPreset(rolInactivo) : {
          key:                 data.rol_key,
          label:               data.rol_key,
          descripcion:         'Rol inactivo o eliminado. Elegí otro rol o Personalizado.',
          modulos:             modulosDePermisos(data.permisos),
          permisos:            data.permisos,
          obras_scope_default: data.obras_scope,
          rol_base:            data.rol_base,
        },
      })
    }
    out.push({ kind: 'personalizado' })
    return out
  }, [presets, roles, isAdmin, isPersonalizado, data.rol_key, data.permisos, data.obras_scope, data.rol_base])

  // Módulos tildados (existen en permisos, aun sin lectura) y módulos con
  // acceso real (lectura=true, que es lo que el backend persiste en modulos).
  const modulosTildados  = useMemo(() => Object.keys(data.permisos), [data.permisos])
  const modulosOtorgados = useMemo(() => modulosDePermisos(data.permisos), [data.permisos])

  // Label del rol del que parte un personalizado (para la card y el resumen).
  const labelRolOrigen = data.rol_key
    ? (presets.find(p => p.key === data.rol_key)?.label ?? roles?.find(r => r.key === data.rol_key)?.label ?? data.rol_key)
    : null

  // Add-ons disponibles según el modo:
  // - Rol: filtra por aplicaA contra el rol_base del rol.
  // - Personalizado: filtra por moduloTarget tildado (o sin moduloTarget si
  //   "se ofrece siempre"). Permite que un user custom como Cristian
  //   (depósito + herramientas) pueda volver a tildar "Cargar horas
  //   propias" si tiene tarja activa.
  const addonsDisponibles = useMemo<AddOn[]>(() => {
    if (isAdmin) return []
    if (isPersonalizado) {
      return ADDONS.filter(a => !a.moduloTarget || modulosTildados.includes(a.moduloTarget))
    }
    return ADDONS.filter(a => addonAplicaA(a, data.rol_base))
  }, [isAdmin, isPersonalizado, data.rol_base, modulosTildados])

  // ── Handlers ────────────────────────────────────────────────────

  function elegirRol(opcion: RolOpcion) {
    setModoManual(opcion.kind === 'personalizado')
    if (opcion.kind === 'admin') {
      onChange({
        rol:           'admin',
        rol_key:       null,
        rol_base:      null,
        personalizado: false,
        obras_scope:   'todas',
        addons:        [],
        permisos:      {},
      })
      return
    }
    if (opcion.kind === 'personalizado') {
      // Conservamos rol_key/rol_base: registran de qué rol partió y la
      // identidad que usa el backend. No tocamos permisos (el admin edita
      // la matriz a mano); los addons que sigan disponibles quedan tildados.
      onChange({
        rol:           'operador',
        personalizado: true,
        obras_scope:   data.obras_scope ?? 'todas',
        addons:        data.addons.filter(k => {
          const a = getAddOn(k)
          return !!a && (!a.moduloTarget || modulosTildados.includes(a.moduloTarget))
        }),
      })
      return
    }
    // Rol.
    const { preset } = opcion
    // Preservamos los addons que ya estaban tildados Y son compatibles con
    // el nuevo rol. Caso típico: el admin estaba en Personalizado con
    // 'cargar_horas_propias' tildado y cambia a 'Encargado de depósito'
    // (que también lo permite) — no tiene sentido obligarlo a re-tildar.
    const addonsCompatibles = data.addons.filter(k => addonAplicaA(getAddOn(k), preset.rol_base))
    const { permisos } = aplicarPreset(preset, addonsCompatibles)
    onChange({
      rol:           'operador',
      rol_key:       preset.key,
      rol_base:      preset.rol_base,
      // Con addons los permisos ya difieren del rol: son ajustes propios.
      personalizado: addonsCompatibles.length > 0,
      obras_scope:   preset.obras_scope_default,
      addons:        addonsCompatibles,
      permisos,
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

    if (isPersonalizado || !presetActual) {
      // Sin rol al que volver: aplicamos/revertimos sobre los permisos actuales.
      const newPermisos = tildado ? addon.revertir(data.permisos) : addon.aplicar(data.permisos)
      onChange({ addons: newAddons, permisos: newPermisos, personalizado: true })
      return
    }
    // Con rol, recomputamos desde cero para mantener idempotencia y borrar
    // correctamente cualquier residuo de un addon ya destildado.
    const { permisos } = aplicarPreset(presetActual, newAddons)
    onChange({
      addons:        newAddons,
      permisos,
      personalizado: newAddons.length > 0,
    })
  }

  function cambiarScope(scope: ObrasScope) {
    onChange({ obras_scope: scope })
  }

  // ── Modo personalizado: edición fina de matriz CRUD ────────────
  // Toda edición manual marca `personalizado: true`.

  function togglePermiso(modKey: string, accion: Accion) {
    const modPerm = data.permisos[modKey] ?? {}
    const nuevoPerm: ModuloPermisos = { ...modPerm, [accion]: !modPerm[accion] }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm }, personalizado: true })
  }

  function toggleModulo(modKey: string) {
    const tiene = modulosTildados.includes(modKey)
    if (tiene) {
      const nuevosPermisos = { ...data.permisos }
      delete nuevosPermisos[modKey]
      // Si el módulo era target de algún addon tildado, también lo destildamos
      // para mantener `data.addons` consistente con `data.permisos`.
      const newAddons = data.addons.filter(k => {
        const a = getAddOn(k)
        return !(a?.moduloTarget === modKey)
      })
      onChange({ permisos: nuevosPermisos, addons: newAddons, personalizado: true })
    } else {
      // Arranca con lectura: sin ella el módulo no aparece para el usuario
      // (el backend deriva `modulos` de los módulos con lectura).
      onChange({
        permisos:      { ...data.permisos, [modKey]: data.permisos[modKey] ?? { lectura: true } },
        personalizado: true,
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
      permisos:      { ...data.permisos, [modKey]: { ...modPerm, tabs: newTabs } },
      personalizado: true,
    })
  }

  function toggleFlag(modKey: string, flag: FlagBoolean) {
    const modPerm = data.permisos[modKey] ?? {}
    const actual = modPerm[flag]
    // Tri-state: undefined (auto) → false → true → undefined.
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
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm }, personalizado: true })
  }

  function cambiarObrasScopeModulo(modKey: string, value: 'sin-override' | 'todas' | 'asignadas') {
    const modPerm = (data.permisos[modKey] ?? {}) as ModuloPermisos & { obras_scope?: ObrasScope }
    const nuevoPerm: ModuloPermisos & { obras_scope?: ObrasScope } = { ...modPerm }
    if (value === 'sin-override') {
      delete nuevoPerm.obras_scope
    } else {
      nuevoPerm.obras_scope = value
    }
    onChange({ permisos: { ...data.permisos, [modKey]: nuevoPerm }, personalizado: true })
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
          {opciones.map(op => {
            const key = op.kind === 'admin' ? 'admin' : op.kind === 'personalizado' ? 'personalizado' : op.preset.key
            const elegido = key === rolElegido
            const label = op.kind === 'admin'
              ? '⭐ Administrador'
              : op.kind === 'personalizado'
                ? '⚙ Personalizado'
                : op.inactivo ? `${op.preset.label} (inactivo)` : op.preset.label
            const desc = op.kind === 'admin'
              ? 'Acceso total al sistema, todos los módulos.'
              : op.kind === 'personalizado'
                ? (isPersonalizado && labelRolOrigen
                    ? `Ajustes propios sobre «${labelRolOrigen}». Los cambios del rol no se le aplican automáticamente.`
                    : 'Edición manual de módulos y permisos.')
                : op.preset.descripcion
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
                  ${op.kind === 'rol' && op.inactivo ? 'opacity-70' : ''}
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
          {!isPersonalizado && data.addons.length > 0 && (
            <div className="mt-2 text-[11px] text-gris-dark bg-gris/40 rounded-md px-2 py-1.5">
              ℹ Con capacidades extra el usuario queda con <b>ajustes propios</b>: «Aplicar rol» desde Plantillas no lo pisa.
            </div>
          )}
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
              const tiene = modulosTildados.includes(m.key)
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
                      {modPerm.lectura !== true && (
                        <div className="mt-2 text-[11px] text-rojo font-semibold">
                          Sin «Ver» el módulo no aparece para el usuario.
                        </div>
                      )}
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
                          {FLAGS_BOOLEAN
                            .filter(f => !f.modulos || f.modulos.includes(m.key))
                            .map(({ key, label, help }) => {
                            const v = (modPerm as Record<string, unknown>)[key]
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

      {/* Resumen (informativo): módulos con acceso real = los que tienen lectura */}
      {!isAdmin && (
        <div className="bg-gris/40 rounded-lg p-2.5 text-[11px] text-gris-dark">
          <span className="font-bold">Módulos otorgados:</span>{' '}
          {modulosOtorgados.length === 0 ? '—' : modulosOtorgados.join(', ')}
        </div>
      )}
    </div>
  )
}
