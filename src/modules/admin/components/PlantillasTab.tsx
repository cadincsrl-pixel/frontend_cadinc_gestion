'use client'

import { PRESETS, ADDONS, getPreset } from '@/lib/permisos/plantillas'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { MODULO_INFO as MODULO_CATALOG } from '@/lib/config/modulos'
import type { ModuloPermisos } from '@/types/domain.types'

// Adaptador del catálogo único (modulos.ts) al shape local que usa este tab.
// El catálogo tiene más metadata; acá solo necesitamos label + icon.
const MODULO_INFO: Record<string, { label: string; icon: string }> = Object.fromEntries(
  Object.entries(MODULO_CATALOG).map(([k, m]) => [k, { label: m.label, icon: m.icono }]),
)

const ACCIONES = [
  { key: 'lectura',       label: 'Ver' },
  { key: 'creacion',      label: 'Crear' },
  { key: 'actualizacion', label: 'Editar' },
  { key: 'eliminacion',   label: 'Eliminar' },
] as const

const FLAGS = [
  { key: 'ver_costos',       label: 'Ver costos' },
  { key: 'ver_pii',          label: 'Ver datos personales' },
  { key: 'administrar_obras', label: 'Administrar obras (catálogo)' },
  { key: 'resolver_items',   label: 'Resolver items' },
  { key: 'forzar_despacho',  label: 'Forzar despacho' },
] as const

type ModPerm = ModuloPermisos & { obras_scope?: string }

export function PlantillasTab() {
  return (
    <div className="flex flex-col gap-4">
      {/* Intro */}
      <div className="bg-azul-light/40 rounded-card p-3 text-xs text-gris-dark border border-azul/20">
        Vista <strong>read-only</strong> de los presets disponibles. Para
        modificar el alcance, editar <code className="text-[11px] bg-white px-1 rounded">src/lib/permisos/plantillas.ts</code> y redeployar.
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-azul uppercase tracking-wider">
          Presets ({PRESETS.length})
        </h2>
        {PRESETS.map(preset => (
          <PresetCard key={preset.key} preset={preset} />
        ))}
      </div>

      {/* Addons */}
      <div className="flex flex-col gap-3 mt-4">
        <h2 className="text-sm font-bold text-azul uppercase tracking-wider">
          Add-ons ({ADDONS.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ADDONS.map(addon => (
            <AddonCard key={addon.key} addon={addon} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PresetCard({ preset }: { preset: typeof PRESETS[number] }) {
  return (
    <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja flex flex-col gap-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-xl text-azul tracking-wide">
            {preset.label}
          </h3>
          <span className="text-[10px] font-mono bg-gris text-gris-dark px-1.5 py-0.5 rounded">
            {preset.key}
          </span>
        </div>
        <p className="text-sm text-gris-dark mt-1">{preset.descripcion}</p>
      </div>

      {/* Config base */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
          Obras visibles default:
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
          preset.obras_scope_default === 'todas'
            ? 'bg-verde-light text-verde'
            : 'bg-amarillo-light text-[#7A5500]'
        }`}>
          {preset.obras_scope_default === 'todas' ? 'Todas' : 'Solo asignadas'}
        </span>
      </div>

      {/* Módulos */}
      <div>
        <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">
          Módulos otorgados ({preset.modulos.length})
        </div>
        <div className="flex flex-wrap gap-1">
          {preset.modulos.map(m => {
            const info = MODULO_INFO[m] ?? { label: m, icon: '•' }
            return (
              <span key={m} className="text-xs font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">
                {info.icon} {info.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Detalle por módulo */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
          Permisos por módulo
        </div>
        {Object.entries(preset.permisos).map(([modKey, modPerm]) => (
          <ModuloPermisosCard
            key={modKey}
            modKey={modKey}
            modPerm={modPerm as ModPerm}
          />
        ))}
      </div>
    </div>
  )
}

function ModuloPermisosCard({ modKey, modPerm }: { modKey: string; modPerm: ModPerm }) {
  const info = MODULO_INFO[modKey] ?? { label: modKey, icon: '•' }
  const allTabs = TABS_POR_MODULO[modKey] ?? []
  // tabs ausente o array vacío → "todos"
  const explicitTabs = modPerm.tabs && modPerm.tabs.length > 0 ? modPerm.tabs : null

  const activeFlags = FLAGS.filter(f => (modPerm as Record<string, unknown>)[f.key] === true)
  const negFlags    = FLAGS.filter(f => (modPerm as Record<string, unknown>)[f.key] === false)

  return (
    <div className="border border-gris-mid rounded-lg p-3 bg-gris/30">
      {/* Encabezado */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{info.icon}</span>
        <span className="font-bold text-sm text-carbon">{info.label}</span>
        <span className="text-[10px] font-mono bg-white text-gris-dark px-1.5 py-0.5 rounded ml-auto">
          {modKey}
        </span>
      </div>

      {/* Acciones CRUD */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {ACCIONES.map(a => {
          const v = (modPerm as Record<string, unknown>)[a.key] === true
          return (
            <span
              key={a.key}
              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${
                v
                  ? 'bg-azul text-white border-azul'
                  : 'bg-white text-gris-mid border-gris-mid'
              }`}
            >
              <span>{v ? '✓' : '○'}</span>
              {a.label}
            </span>
          )
        })}
      </div>

      {/* Tabs habilitados */}
      {allTabs.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">
            Tabs visibles {explicitTabs ? `(${explicitTabs.length} de ${allTabs.length})` : '(todos)'}
          </div>
          <div className="flex flex-wrap gap-1">
            {allTabs.map(tab => {
              const enabled = explicitTabs ? explicitTabs.includes(tab.key) : true
              return (
                <span
                  key={tab.key}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                    enabled
                      ? 'bg-naranja text-white border-naranja'
                      : 'bg-white text-gris-mid border-gris-mid line-through'
                  }`}
                >
                  {tab.icon} {tab.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Capacidades / flags */}
      {(activeFlags.length > 0 || negFlags.length > 0) && (
        <div className="mb-2">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">
            Capacidades
          </div>
          <div className="flex flex-wrap gap-1">
            {activeFlags.map(f => (
              <span key={f.key} className="text-[11px] font-bold bg-verde text-white px-2 py-0.5 rounded">
                ✓ {f.label}
              </span>
            ))}
            {negFlags.map(f => (
              <span key={f.key} className="text-[11px] font-bold bg-rojo text-white px-2 py-0.5 rounded">
                ✕ {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Override de obras_scope */}
      {modPerm.obras_scope && (
        <div className="text-[11px] text-gris-dark">
          <span className="font-bold uppercase tracking-wider text-[10px]">
            Override obras_scope:
          </span>{' '}
          <span className="font-bold text-azul">{modPerm.obras_scope}</span>
        </div>
      )}
    </div>
  )
}

function AddonCard({ addon }: { addon: typeof ADDONS[number] }) {
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
          <span className="font-bold text-gris-dark">Aplica a:</span>
          {addon.aplicaA.map(p => {
            const preset = getPreset(p)
            return (
              <span key={p} className="text-[10px] font-bold bg-azul-light text-azul-mid px-1.5 py-0.5 rounded">
                {preset?.label ?? p}
              </span>
            )
          })}
        </div>
        {addon.moduloTarget && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-gris-dark">Módulo target:</span>
            <span className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded">
              {MODULO_INFO[addon.moduloTarget]?.icon ?? ''} {MODULO_INFO[addon.moduloTarget]?.label ?? addon.moduloTarget}
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
