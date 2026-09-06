'use client'

/**
 * Editor de roles (tabla `roles`) — Admin → Plantillas de roles.
 *
 * Cada rol es una PLANTILLA: al elegirlo en un usuario se le copian sus
 * permisos. Editar acá no cambia a nadie hasta «Aplicar», que copia los
 * permisos guardados a los usuarios del rol sin ajustes propios
 * (`personalizado = false`). Los add-ons siguen en código y se muestran
 * read-only al pie.
 *
 * Sin `usePermisos`: la pantalla es admin-only (lo garantiza el módulo admin)
 * y el backend valida igual. Los botones mutativos se deshabilitan/spinnean
 * mientras corre la mutación.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { HttpError } from '@/lib/api/client'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { MODULO_INFO, esModuloValido, modulosOrdenados, type ModuloInfo } from '@/lib/config/modulos'
import { ACCIONES, MODULOS_CON_OBRAS_SCOPE, flagsDeModulo, type FlagBoolean } from '@/lib/permisos/flags'
import {
  ADDONS, PRESETS_FALLBACK, ROL_BASES, canonJson, modulosDePermisos,
  type AddOn,
} from '@/lib/permisos/plantillas'
import {
  useRoles, useCrearRol, useActualizarRol, useAplicarRol, useEliminarRol,
  type ActualizarRolDto,
} from '@/modules/configuracion/hooks/useRoles'
import type { ModuloPermisos, ObrasScope, Permisos, Rol, RolBase } from '@/types/domain.types'

type ModPerm = ModuloPermisos & { obras_scope?: ObrasScope }

// Campos editables del rol (lo que puede viajar en el PATCH).
interface RolDraft {
  label:               string
  descripcion:         string
  obras_scope_default: ObrasScope
  rol_base:            RolBase | null
  activo:              boolean
  permisos:            Permisos
}

function draftDe(rol: Rol): RolDraft {
  return {
    label:               rol.label,
    descripcion:         rol.descripcion ?? '',
    obras_scope_default: rol.obras_scope_default,
    rol_base:            rol.rol_base,
    activo:              rol.activo,
    permisos:            rol.permisos ?? {},
  }
}

// Mismas reglas que el backend (CreateRolSchema).
const KEY_RE = /^[a-z0-9_]{2,40}$/

function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function mensajeError(e: unknown, fallback: string): string {
  if (e instanceof HttpError) {
    if (e.message === 'ROL_DUPLICADO') return 'Ya existe un rol con esa clave.'
    if (e.message === 'ROL_NO_EXISTE') return 'El rol ya no existe. Recargá la página.'
    if (e.message === 'ROL_EN_USO')    return 'No se puede eliminar: el rol tiene usuarios.'
    return e.message || fallback
  }
  return e instanceof Error && e.message ? e.message : fallback
}

const ordenRoles = (a: Rol, b: Rol) => a.orden - b.orden || a.key.localeCompare(b.key)

export function PlantillasTab() {
  const { data: roles, isLoading, isError, error, refetch, isFetching } = useRoles()
  const [modalNuevo, setModalNuevo] = useState(false)
  const ordenados = useMemo(() => [...(roles ?? [])].sort(ordenRoles), [roles])

  return (
    <div className="flex flex-col gap-4">
      {/* Intro */}
      <div className="bg-azul-light/40 rounded-card p-3 text-xs text-gris-dark border border-azul/20">
        Los roles son <strong>plantillas</strong>: al elegir uno en un usuario se le copian sus permisos.
        Editar un rol acá <strong>no cambia a nadie</strong> hasta que hacés «Aplicar»: eso pisa los permisos
        de los usuarios del rol <strong>sin ajustes propios</strong>; los que tienen ajustes propios se
        revisan a mano desde Usuarios.
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-bold text-azul uppercase tracking-wider">
          Roles ({ordenados.length})
        </h2>
        <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo rol
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-6 flex items-center justify-center gap-2 text-sm text-gris-dark">
          <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando roles...
        </div>
      ) : isError ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-3 flex-wrap">
          <span>No se pudieron cargar los roles: {mensajeError(error, 'error desconocido')}</span>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
            Reintentar
          </Button>
        </div>
      ) : ordenados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-6 text-center text-sm text-gris-dark italic">
          No hay roles. Creá el primero con «Nuevo rol».
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ordenados.map(rol => <RolEditor key={rol.key} rol={rol} />)}
        </div>
      )}

      {/* Add-ons (read-only, siguen en código) */}
      <div className="flex flex-col gap-3 mt-4">
        <h2 className="text-sm font-bold text-azul uppercase tracking-wider">
          Add-ons ({ADDONS.length})
        </h2>
        <p className="text-xs text-gris-dark -mt-2">
          Variaciones de tarja que se aplican encima de un rol al editar un usuario. Viven en código
          (<code className="text-[11px] bg-white px-1 rounded">src/lib/permisos/plantillas.ts</code>) y se
          ofrecen según la identidad (<code className="text-[11px] bg-white px-1 rounded">rol_base</code>) del rol.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ADDONS.map(addon => (
            <AddonCard key={addon.key} addon={addon} roles={ordenados} />
          ))}
        </div>
      </div>

      <NuevoRolModal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        existentes={ordenados.map(r => r.key)}
      />
    </div>
  )
}

// ── Editor de un rol ─────────────────────────────────────────────────────────

function RolEditor({ rol }: { rol: Rol }) {
  const toast      = useToast()
  const actualizar = useActualizarRol()
  const aplicar    = useAplicarRol()
  const eliminar   = useEliminarRol()

  // Draft local sin efectos: se guarda junto con el canon de la versión del
  // servidor de la que partió. Si el servidor trae otra versión (guardado
  // propio o ajeno), el draft se descarta y se parte de la nueva.
  const base      = draftDe(rol)
  const baseCanon = canonJson(base)
  const [edicion, setEdicion] = useState<{ baseCanon: string; draft: RolDraft } | null>(null)
  const draft = edicion && edicion.baseCanon === baseCanon ? edicion.draft : base
  const dirty = canonJson(draft) !== baseCanon

  const setDraft = (patch: Partial<RolDraft>) =>
    setEdicion({ baseCanon, draft: { ...draft, ...patch } })

  const setModulo = (modKey: string, next: ModPerm | null) => {
    const permisos: Permisos = { ...draft.permisos }
    if (next === null) delete permisos[modKey]
    else permisos[modKey] = next
    setDraft({ permisos })
  }

  const sinAjustes = Math.max(0, rol.usuarios - rol.personalizados)
  const ocupado    = actualizar.isPending || aplicar.isPending || eliminar.isPending
  const labelOk    = draft.label.trim().length > 0
  const conAcceso  = modulosDePermisos(draft.permisos).length

  function guardar() {
    if (!dirty || !labelOk) return
    // Solo los campos que cambiaron (PATCH parcial; el audit log queda limpio).
    const dto: ActualizarRolDto = {}
    if (draft.label.trim() !== base.label)                       dto.label = draft.label.trim()
    if (draft.descripcion.trim() !== base.descripcion)           dto.descripcion = draft.descripcion.trim()
    if (draft.obras_scope_default !== base.obras_scope_default)  dto.obras_scope_default = draft.obras_scope_default
    if (draft.rol_base !== base.rol_base)                        dto.rol_base = draft.rol_base
    if (draft.activo !== base.activo)                            dto.activo = draft.activo
    if (canonJson(draft.permisos) !== canonJson(base.permisos))  dto.permisos = draft.permisos
    if (Object.keys(dto).length === 0) { setEdicion(null); return }
    actualizar.mutate({ key: rol.key, dto }, {
      onSuccess: () => {
        toast(`✓ Rol «${dto.label ?? rol.label}» guardado`, 'ok')
        setEdicion(null)
      },
      onError: (e) => toast(mensajeError(e, 'Error al guardar el rol'), 'err'),
    })
  }

  function aplicarRol() {
    if (dirty || sinAjustes === 0) return
    const lineas = [
      `Se van a pisar los permisos de ${sinAjustes} usuario${sinAjustes === 1 ? '' : 's'} con el rol «${rol.label}» por los del rol guardado.`,
      rol.personalizados > 0
        ? `Los ${rol.personalizados} con ajustes propios NO se tocan.`
        : null,
      '¿Continuar?',
    ].filter(Boolean)
    if (!confirm(lineas.join('\n'))) return
    aplicar.mutate(rol.key, {
      onSuccess: (r) => toast(
        r.aplicados === 0
          ? 'No había usuarios para actualizar.'
          : `✓ Permisos aplicados a ${r.aplicados}: ${r.usuarios.join(', ')}`,
        'ok',
      ),
      onError: (e) => toast(mensajeError(e, 'Error al aplicar el rol'), 'err'),
    })
  }

  function eliminarRol() {
    if (rol.usuarios > 0) return
    if (!confirm(`¿Eliminar el rol «${rol.label}» (${rol.key})? Esta acción no se puede deshacer.`)) return
    eliminar.mutate(rol.key, {
      onSuccess: () => toast(`✓ Rol «${rol.label}» eliminado`, 'ok'),
      onError: (e) => {
        if (e instanceof HttpError && e.status === 409) {
          const n = (e.body as { detail?: { usuarios?: number } } | undefined)?.detail?.usuarios
          toast(`No se puede eliminar: ${n ?? 'hay'} usuario${n === 1 ? '' : 's'} con este rol.`, 'err')
          return
        }
        toast(mensajeError(e, 'Error al eliminar el rol'), 'err')
      },
    })
  }

  return (
    <div className={`bg-white rounded-card shadow-card p-4 border-l-[5px] flex flex-col gap-3
      ${draft.activo ? 'border-naranja' : 'border-gris-mid'}`}>

      {/* Cabecera: label, key, descripción, contador */}
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-full sm:w-80">
              <Input
                aria-label="Nombre del rol"
                value={draft.label}
                onChange={e => setDraft({ label: e.target.value })}
                maxLength={60}
                error={labelOk ? undefined : 'El nombre no puede quedar vacío.'}
                className="font-display text-xl text-azul tracking-wide"
              />
            </div>
            <span className="text-[10px] font-mono bg-gris text-gris-dark px-1.5 py-0.5 rounded">
              {rol.key}
            </span>
            {!draft.activo && (
              <span className="text-[10px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded uppercase">
                inactivo
              </span>
            )}
            {dirty && (
              <span className="text-[10px] font-bold bg-amarillo-light text-[#7A5500] px-1.5 py-0.5 rounded">
                sin guardar
              </span>
            )}
          </div>
          <textarea
            aria-label="Descripción del rol"
            value={draft.descripcion}
            onChange={e => setDraft({ descripcion: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Descripción del rol (qué hace, para quién es)"
            className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm text-carbon bg-blanco outline-none focus:border-naranja focus:bg-white resize-y placeholder:text-gris-mid"
          />
        </div>
        <div className="text-xs text-gris-dark md:text-right shrink-0">
          <div className="font-bold text-carbon">
            {rol.usuarios} usuario{rol.usuarios === 1 ? '' : 's'} · {rol.personalizados} con ajustes propios
          </div>
          <div className="text-[10px] mt-0.5">orden {rol.orden}</div>
        </div>
      </div>

      {/* Config base */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Obras visibles por defecto
          </span>
          <div className="flex gap-2">
            {(['todas', 'asignadas'] as const).map(v => (
              <label
                key={v}
                className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border-[1.5px] cursor-pointer
                  ${draft.obras_scope_default === v
                    ? 'border-naranja bg-naranja-light text-carbon'
                    : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}
              >
                <input
                  type="radio"
                  name={`scope-${rol.key}`}
                  checked={draft.obras_scope_default === v}
                  onChange={() => setDraft({ obras_scope_default: v })}
                />
                {v === 'todas' ? 'Todas' : 'Solo asignadas'}
              </label>
            ))}
          </div>
        </div>
        <div className="w-full sm:w-64">
          <Select
            label="Identidad para el backend (rol_base)"
            title="Capataz y jefe de obra scopean por obra en el backend; también define qué add-ons se ofrecen."
            value={draft.rol_base ?? ''}
            onChange={e => setDraft({ rol_base: ROL_BASES.find(r => r.key === e.target.value)?.key ?? null })}
            options={ROL_BASES.map(r => ({ value: r.key, label: r.label }))}
            placeholder="ninguna"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-carbon cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={draft.activo}
            onChange={e => setDraft({ activo: e.target.checked })}
            className="accent-naranja w-4 h-4"
          />
          Activo (se ofrece al asignar rol)
        </label>
      </div>

      {/* Módulos y permisos */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
          Módulos y permisos · {conAcceso} con acceso
        </div>
        {modulosOrdenados().map(m => (
          <ModuloEditor
            key={m.key}
            info={m}
            modPerm={draft.permisos[m.key] as ModPerm | undefined}
            onChange={next => setModulo(m.key, next)}
          />
        ))}
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-gris">
        <Button
          variant="danger"
          size="sm"
          onClick={eliminarRol}
          disabled={rol.usuarios > 0 || ocupado}
          loading={eliminar.isPending}
          title={rol.usuarios > 0
            ? `No se puede eliminar: ${rol.usuarios} usuario(s) con este rol`
            : 'Eliminar el rol'}
        >
          ✕ Eliminar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={aplicarRol}
          disabled={sinAjustes === 0 || dirty || ocupado}
          loading={aplicar.isPending}
          title={dirty
            ? 'Guardá los cambios antes de aplicar'
            : sinAjustes === 0
              ? 'No hay usuarios sin ajustes propios con este rol'
              : `Copia los permisos guardados a ${sinAjustes} usuario(s)`}
        >
          ↻ Aplicar a {sinAjustes} usuario{sinAjustes === 1 ? '' : 's'}
        </Button>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => setEdicion(null)} disabled={ocupado}>
            Descartar
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={guardar}
          disabled={!dirty || !labelOk || ocupado}
          loading={actualizar.isPending}
        >
          ✓ Guardar
        </Button>
      </div>
    </div>
  )
}

// ── Un módulo dentro del rol: CRUD + tabs + flags + override de obras ────────

function ModuloEditor({
  info, modPerm, onChange,
}: {
  info:     ModuloInfo
  modPerm:  ModPerm | undefined
  onChange: (next: ModPerm | null) => void
}) {
  const modKey       = info.key
  const tiene        = modPerm !== undefined
  const allTabs      = TABS_POR_MODULO[modKey] ?? []
  const flags        = flagsDeModulo(modKey)
  const tabsActuales = modPerm?.tabs ?? []
  const obrasScope: 'sin-override' | ObrasScope = modPerm?.obras_scope ?? 'sin-override'

  function toggleTab(tabKey: string) {
    if (!modPerm) return
    const keys = allTabs.map(t => t.key)
    let next: string[]
    if (tabsActuales.length === 0)             next = keys.filter(t => t !== tabKey)
    else if (tabsActuales.includes(tabKey))    next = tabsActuales.filter(t => t !== tabKey)
    else                                       next = [...tabsActuales, tabKey]
    // Todos tildados = sin restricción: se quita la clave (mismo significado
    // que [] para useTabsPermitidos / GuardWrapper).
    if (keys.every(k => next.includes(k))) {
      const sinTabs: ModPerm = { ...modPerm }
      delete sinTabs.tabs
      onChange(sinTabs)
    } else {
      onChange({ ...modPerm, tabs: next })
    }
  }

  function toggleFlag(flag: FlagBoolean) {
    if (!modPerm) return
    // Tri-state, igual que el wizard: auto (sin clave) → no → sí → auto.
    const actual = modPerm[flag]
    const next: ModPerm = { ...modPerm }
    if (actual === undefined)   next[flag] = false
    else if (actual === false)  next[flag] = true
    else                        delete next[flag]
    onChange(next)
  }

  function setObrasScope(v: string) {
    if (!modPerm) return
    const next: ModPerm = { ...modPerm }
    if (v === 'todas' || v === 'asignadas') next.obras_scope = v
    else delete next.obras_scope
    onChange(next)
  }

  return (
    <div className={`rounded-xl border-[1.5px] overflow-hidden ${tiene ? 'border-naranja' : 'border-gris-mid'}`}>
      <label className={`flex items-center gap-3 p-2.5 cursor-pointer ${tiene ? 'bg-naranja-light' : 'bg-white hover:bg-gris/40'}`}>
        <input
          type="checkbox"
          checked={tiene}
          // Arranca con lectura: sin ella el módulo no aparece para el usuario.
          onChange={() => onChange(tiene ? null : { lectura: true })}
          className="accent-naranja w-4 h-4"
        />
        <span className="text-xl">{info.icono}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-carbon">{info.label}</div>
          <div className="text-[11px] text-gris-dark">{info.descripcion}</div>
        </div>
        <span className="text-[10px] font-mono bg-white text-gris-dark px-1.5 py-0.5 rounded shrink-0">
          {modKey}
        </span>
      </label>

      {modPerm && (
        <div className="px-3 pb-3 pt-2 bg-white border-t border-naranja/20 flex flex-col gap-2">
          {/* Acciones CRUD */}
          <div className="flex gap-1.5 flex-wrap">
            {ACCIONES.map(a => {
              const v = modPerm[a.key] === true
              return (
                <label
                  key={a.key}
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border-[1.5px] cursor-pointer transition-all
                    ${v ? 'bg-azul text-white border-azul' : 'bg-white text-gris-dark border-gris-mid hover:border-azul hover:text-azul'}`}
                >
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={() => onChange({ ...modPerm, [a.key]: !v })}
                    className="w-3.5 h-3.5"
                  />
                  {a.label}
                </label>
              )
            })}
          </div>
          {modPerm.lectura !== true && (
            <div className="text-[11px] text-rojo font-semibold">
              Sin «Ver» el módulo no aparece para el usuario.
            </div>
          )}

          {/* Tabs */}
          {allTabs.length > 0 && (
            <div className="pt-2 border-t border-gris">
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                Secciones visibles {tabsActuales.length === 0 ? '(todas)' : `(${tabsActuales.length} de ${allTabs.length})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {allTabs.map(tab => {
                  const on = tabsActuales.length === 0 || tabsActuales.includes(tab.key)
                  return (
                    <label
                      key={tab.key}
                      className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer transition-all
                        ${on ? 'bg-naranja text-white border-naranja' : 'bg-white text-gris-dark border-gris-mid hover:border-naranja hover:text-naranja'}`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleTab(tab.key)} className="w-3.5 h-3.5" />
                      <span>{tab.icon}</span>
                      {tab.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Capacidades / flags */}
          {flags.length > 0 && (
            <div className="pt-2 border-t border-gris">
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                Capacidades
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {flags.map(({ key, label, help }) => {
                  const v = modPerm[key]
                  const estado = v === undefined ? 'auto' : v ? 'sí' : 'no'
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFlag(key)}
                      title={help}
                      className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all
                        ${v === true
                          ? 'bg-verde text-white border-verde'
                          : v === false
                            ? 'bg-rojo text-white border-rojo'
                            : 'bg-white text-gris-dark border-gris-mid hover:border-azul hover:text-azul'}`}
                    >
                      <span>{label}</span>
                      <span className="opacity-80">[{estado}]</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Override de obras_scope por módulo */}
          {MODULOS_CON_OBRAS_SCOPE.has(modKey) && (
            <div className="pt-2 border-t border-gris flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-bold text-gris-dark uppercase tracking-wider"
                title="Override del scope de obras solo para este módulo. Sin override se usa el scope global del usuario."
              >
                Obras (override)
              </span>
              <select
                value={obrasScope}
                onChange={e => setObrasScope(e.target.value)}
                className="text-[11px] border border-gris-mid rounded px-2 py-1 bg-white"
              >
                <option value="sin-override">Sin override</option>
                <option value="todas">Todas</option>
                <option value="asignadas">Asignadas</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add-ons (read-only) ──────────────────────────────────────────────────────

function AddonCard({ addon, roles }: { addon: AddOn; roles: Rol[] }) {
  const target = addon.moduloTarget && esModuloValido(addon.moduloTarget)
    ? MODULO_INFO[addon.moduloTarget]
    : null
  return (
    <div className="border border-gris-mid rounded-lg p-3 bg-white flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-sm text-carbon">＋ {addon.label}</h4>
        <span className="text-[10px] font-mono bg-gris text-gris-dark px-1.5 py-0.5 rounded shrink-0">
          {addon.key}
        </span>
      </div>
      <p className="text-[11px] text-gris-dark">{addon.descripcion}</p>

      <div className="flex flex-col gap-1 text-[11px] mt-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-bold text-gris-dark">Aplica a roles con identidad:</span>
          {addon.aplicaA.map(rb => {
            const conEsaBase = roles.filter(r => r.rol_base === rb).map(r => r.label)
            const label = ROL_BASES.find(r => r.key === rb)?.label
              ?? PRESETS_FALLBACK.find(p => p.key === rb)?.label
              ?? rb
            return (
              <span
                key={rb}
                className="text-[10px] font-bold bg-azul-light text-azul-mid px-1.5 py-0.5 rounded"
                title={conEsaBase.length > 0 ? `Roles: ${conEsaBase.join(', ')}` : 'Ningún rol tiene esta identidad'}
              >
                {label}{conEsaBase.length > 0 ? ` (${conEsaBase.join(', ')})` : ''}
              </span>
            )
          })}
        </div>
        {addon.moduloTarget && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-gris-dark">Módulo target:</span>
            <span className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded">
              {target?.icono ?? ''} {target?.label ?? addon.moduloTarget}
            </span>
          </div>
        )}
        {addon.excluye && addon.excluye.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-gris-dark">Excluye:</span>
            {addon.excluye.map(k => (
              <span key={k} className="text-[10px] font-bold bg-rojo-light text-rojo px-1.5 py-0.5 rounded">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal: nuevo rol (key + label; nace sin permisos) ────────────────────────

function NuevoRolModal({
  open, onClose, existentes,
}: {
  open:       boolean
  onClose:    () => void
  existentes: string[]
}) {
  const toast = useToast()
  const crear = useCrearRol()
  const [label, setLabel]         = useState('')
  const [key, setKey]             = useState('')
  const [keyTocada, setKeyTocada] = useState(false)

  // La clave se sugiere desde el nombre hasta que el admin la toca a mano.
  const keyEfectiva = keyTocada ? key : slugify(label)
  const keyValida   = KEY_RE.test(keyEfectiva)
  const duplicada   = existentes.includes(keyEfectiva)
  const errorKey =
    keyEfectiva.length === 0 ? undefined
    : !keyValida ? 'Solo minúsculas, números y guion bajo (2 a 40 caracteres).'
    : duplicada  ? 'Ya existe un rol con esa clave.'
    : undefined
  const puedeCrear = label.trim().length > 0 && keyValida && !duplicada

  function cerrar() {
    setLabel('')
    setKey('')
    setKeyTocada(false)
    onClose()
  }

  function submit() {
    if (!puedeCrear) return
    crear.mutate(
      {
        key:                 keyEfectiva,
        label:               label.trim(),
        descripcion:         '',
        permisos:            {},
        obras_scope_default: 'todas',
        rol_base:            null,
      },
      {
        onSuccess: () => {
          toast(`✓ Rol «${label.trim()}» creado. Configurá sus permisos y guardá.`, 'ok')
          cerrar()
        },
        onError: (e) => toast(mensajeError(e, 'Error al crear el rol'), 'err'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="🎭 NUEVO ROL"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!puedeCrear} loading={crear.isPending}>
            ✓ Crear rol
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Nombre"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Ej: Administrativo de logística"
          maxLength={60}
          autoFocus
        />
        <Input
          label="Clave (slug)"
          value={keyEfectiva}
          onChange={e => { setKeyTocada(true); setKey(e.target.value.toLowerCase()) }}
          placeholder="administrativo_logistica"
          error={errorKey}
          hint="Identificador interno; no se puede cambiar después."
          className="font-mono"
        />
        <p className="text-xs text-gris-dark">
          El rol nace sin permisos: después de crearlo, tildá módulos y acciones en su tarjeta y guardá.
        </p>
      </div>
    </Modal>
  )
}
