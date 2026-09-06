'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { modulosOrdenados } from '@/lib/config/modulos'
import { Modal }    from '@/components/ui/Modal'
import { UsuarioObrasSection } from './UsuarioObrasSection'
import { PermisosWizard, type WizardData } from './PermisosWizard'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useSessionStore } from '@/store/session.store'
import { deriveAddons, getAddOn, labelDeRol } from '@/lib/permisos/plantillas'
import type { RolBase, ObrasScope } from '@/lib/permisos/plantillas'
import { useRoles } from '../hooks/useRoles'
import type { Permisos, Profile, Modulo } from '@/types/domain.types'

// Etiqueta corta del addon para los chips de la tabla. Cae al key si el
// addon ya no existe en el catálogo (ej. addon viejo deprecado).
function addonLabel(key: string): string {
  return getAddOn(key)?.label ?? key
}

interface NuevoUsuario {
  email:         string
  password:      string
  nombre:        string
  rol:           'admin' | 'operador'
  permisos:      Permisos
  rol_base:      RolBase | null
  obras_scope:   ObrasScope
  addons:        string[]
  // Rol del que parte (tabla `roles`) y si tiene ajustes propios. Sin rol
  // elegido el wizard arranca en modo personalizado.
  rol_key:       string | null
  personalizado: boolean
}

const EMPTY_NUEVO: NuevoUsuario = {
  email:         '',
  password:      '',
  nombre:        '',
  rol:           'operador',
  permisos:      {},
  rol_base:      null,
  obras_scope:   'todas',
  addons:        [],
  rol_key:       null,
  personalizado: true,
}

// ── Payloads hacia /api/usuarios ──
// Sin `modulos` (el backend lo deriva de `permisos`: módulos con lectura) ni
// `tipo_usuario` (murió con los roles editables; el backend lo ignora).
interface UsuarioPermisosDto {
  rol:           'admin' | 'operador'
  permisos:      Permisos
  rol_base:      RolBase | null
  obras_scope:   ObrasScope
  rol_key:       string | null
  personalizado: boolean
}
interface CrearUsuarioDto extends UsuarioPermisosDto {
  email:    string
  password: string
  nombre:   string
}
interface ActualizarUsuarioDto extends UsuarioPermisosDto {
  nombre: string
  email?: string
  activo: boolean
}

function permisosDto(
  d: Pick<Profile, 'rol' | 'permisos' | 'rol_base' | 'obras_scope' | 'rol_key' | 'personalizado'>,
): UsuarioPermisosDto {
  // Admin: bypass total, sin rol ni permisos. Defensa en profundidad aunque
  // el wizard ya limpie todo al elegir la card "Administrador".
  if (d.rol === 'admin') {
    return { rol: 'admin', permisos: {}, rol_base: null, obras_scope: 'todas', rol_key: null, personalizado: false }
  }
  const rol_key = d.rol_key ?? null
  return {
    rol:           'operador',
    permisos:      d.permisos,
    rol_base:      d.rol_base ?? null,
    obras_scope:   d.obras_scope ?? 'todas',
    rol_key,
    // Sin rol del que partir es personalizado por definición.
    personalizado: (d.personalizado ?? false) || rol_key === null,
  }
}

function payloadCrear(f: NuevoUsuario): CrearUsuarioDto {
  return { email: f.email, password: f.password, nombre: f.nombre, ...permisosDto(f) }
}

// Perfiles anteriores a los roles editables no traen rol_key/personalizado:
// se derivan de rol_base (los presets viejos son roles con la misma key).
function rolKeyDe(u: Pick<Profile, 'rol_key' | 'rol_base'>): string | null {
  return u.rol_key ?? u.rol_base ?? null
}
function esPersonalizado(u: Pick<Profile, 'rol_key' | 'rol_base' | 'personalizado' | 'permisos'>): boolean {
  // Sin la flag (perfil viejo): personalizado si no parte de un rol o si sus
  // permisos traen add-ons (ya difieren del rol; "Aplicar rol" los pisaría).
  return u.personalizado ?? (rolKeyDe(u) === null || deriveAddons(u.rol_base ?? null, u.permisos).length > 0)
}

// `deriveAddons` se importa de `lib/permisos/plantillas.ts` (inspecciona
// `permisos` directamente para cubrir los addons; no se persisten).

export function UsuariosTab() {
  const toast        = useToast()
  const qc           = useQueryClient()
  const profileActual = useSessionStore(s => s.profile)
  const iniciarSimulacion = useSessionStore(s => s.iniciarSimulacion)
  const router = useRouter()

  // El estado de edición extiende Profile con `addons` (no se persiste en
  // DB; lo derivamos de los permisos al abrir el modal y lo usa el wizard
  // para mostrar qué add-ons tiene activos).
  type EditandoState = Profile & { addons: string[]; email?: string }
  const [editando,    setEditando]    = useState<EditandoState | null>(null)
  const [rolOriginal, setRolOriginal] = useState<string | null>(null)
  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [nuevoForm,   setNuevoForm]   = useState<NuevoUsuario>(EMPTY_NUEVO)
  const [resetId,        setResetId]        = useState<string | null>(null)
  const [newPass,        setNewPass]        = useState('')
  const [newPassConfirm, setNewPassConfirm] = useState('')
  const [showPass,       setShowPass]       = useState(false)
  const [busqueda,    setBusqueda]    = useState('')

  // Modal de confirmación cuando se está promocionando a un usuario a admin.
  // Pide tipear "ADMIN" para evitar privilege escalation accidental.
  const [confirmAdmin, setConfirmAdmin] = useState<{
    nombre: string
    onConfirm: () => void
  } | null>(null)
  const [confirmAdminText, setConfirmAdminText] = useState('')

  // Helper para cerrar el modal de cambio de contraseña dejando todo limpio.
  // Lo usamos desde cancelar, onClose y onSuccess.
  function cerrarModalPassword() {
    setResetId(null)
    setNewPass('')
    setNewPassConfirm('')
    setShowPass(false)
  }

  const { mutate: resetPassword, isPending: resetting } = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiPost(`/api/usuarios/${id}/reset-password`, { password }),
    onSuccess: () => { toast('Contraseña actualizada', 'ok'); cerrarModalPassword() },
    onError: (e: Error) => toast(e.message || 'Error', 'err'),
  })

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
  })

  // Labels de los roles (tabla `roles`) para badges y filtro. Mientras carga
  // cae al seed en código.
  const { data: roles } = useRoles()
  const rolLabel = (u: Profile): string | null =>
    labelDeRol(rolKeyDe(u), u.rol_base ?? null, roles)

  // Filtrado client-side: matchea contra nombre, email, rol, rol (key y
  // label), "personalizado" y módulos. Case-insensitive. Sin filtro = todos.
  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(u => {
      const haystack = [
        u.nombre,
        (u as { email?: string }).email,
        u.rol,
        rolKeyDe(u),
        labelDeRol(rolKeyDe(u), u.rol_base ?? null, roles),
        u.rol !== 'admin' && esPersonalizado(u) ? 'personalizado' : null,
        ...(u.modulos ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [usuarios, busqueda, roles])

  // Módulos: fuente única en `src/lib/config/modulos.ts`. `admin` no entra:
  // no es asignable (marcado `noAsignable`), se hereda del rol admin; el
  // backend nunca lo consulta, así que tildarlo solo confundía.
  const modulos: Modulo[] = modulosOrdenados().map((m, idx) => ({
    id:          idx,
    key:         m.key,
    nombre:      m.label,
    descripcion: m.descripcion,
    icono:       m.icono,
    activo:      true,
    orden:       m.orden,
  }))

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (form: NuevoUsuario) => apiPost('/api/usuarios', payloadCrear(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast('✓ Usuario creado', 'ok')
      setModalNuevo(false)
      setNuevoForm(EMPTY_NUEVO)
    },
    onError: (e: Error) => toast(e.message || 'Error al crear usuario', 'err'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ActualizarUsuarioDto }) =>
      apiPatch(`/api/usuarios/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast('✓ Usuario actualizado', 'ok')
      setEditando(null)
    },
    onError: () => toast('Error al actualizar', 'err'),
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/usuarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast('✓ Usuario eliminado', 'ok')
    },
    onError: (e: Error) => toast(e.message || 'Error al eliminar', 'err'),
  })

  function handleDelete(u: Profile) {
    if (u.id === profileActual?.id) {
      toast('No podés eliminarte a vos mismo', 'err')
      return
    }
    if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return
    remove(u.id)
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-azul text-base">
            Usuarios ({busqueda
              ? `${usuariosFiltrados.length} de ${usuarios.length}`
              : usuarios.length})
          </h2>
          <p className="text-xs text-gris-dark mt-0.5">
            Gestioná roles y módulos de acceso por usuario.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por nombre, email, rol, módulo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-64"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>
              ✕ Limpiar
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
            ＋ Nuevo usuario
          </Button>
        </div>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
            <tr>
              {['Usuario', 'Email', 'Rol', 'Módulos', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8">
                  <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                    <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </span>
                </td>
              </tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-xs text-gris-dark italic">
                  Sin resultados para &quot;{busqueda}&quot;.
                </td>
              </tr>
            ) : usuariosFiltrados.map(u => (
              <tr key={u.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-sm flex-shrink-0">
                      {u.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-carbon">{u.nombre}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {/* Badge principal: label del rol (tabla `roles`) o
                            "Personalizado" si no parte de ninguno. */}
                        {u.rol !== 'admin' && rolKeyDe(u) && (
                          <span className="text-[10px] font-bold text-azul-mid bg-azul-light px-1.5 py-0.5 rounded">
                            {rolLabel(u)}
                          </span>
                        )}
                        {u.rol !== 'admin' && !rolKeyDe(u) && (
                          <span className="text-[10px] font-bold text-gris-dark bg-gris px-1.5 py-0.5 rounded">
                            ⚙ Personalizado
                          </span>
                        )}
                        {u.rol !== 'admin' && rolKeyDe(u) && esPersonalizado(u) && (
                          <span
                            className="text-[10px] font-bold text-[#7A5500] bg-amarillo-light px-1.5 py-0.5 rounded"
                            title="Tiene ajustes propios sobre el rol: «Aplicar rol» no lo pisa"
                          >
                            ajustes propios
                          </span>
                        )}
                        {/* Chips de addons activos (derivados de los permisos
                            persistidos). Visibilidad rápida del combo real.
                            Funciona también para usuarios "personalizados"
                            (rol_base=null) cuando el addon dejó marcas
                            distintivas en permisos (ej: cargar_horas_propias). */}
                        {deriveAddons((u.rol_base ?? null) as RolBase | null, u.permisos).map(addonKey => (
                          <span
                            key={addonKey}
                            className="text-[10px] font-bold text-naranja-dark bg-naranja-light px-1.5 py-0.5 rounded"
                            title={addonKey}
                          >
                            ＋ {addonLabel(addonKey)}
                          </span>
                        ))}
                        {u.id === profileActual?.id && (
                          <span className="text-[10px] text-naranja font-bold">Vos</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gris-dark">{(u as { email?: string | null }).email ?? '—'}</td>
                <td className="px-4 py-3">
                  {u.rol === 'admin' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]">
                      ⭐ Admin
                    </span>
                  ) : rolKeyDe(u) ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                      {rolLabel(u)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">
                      ⚙ Personalizado
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.rol === 'admin' ? (
                      <span className="text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                        Todos
                      </span>
                    ) : u.modulos.length === 0 ? (
                      <span className="text-xs text-gris-mid">Sin acceso</span>
                    ) : u.modulos.map(m => (
                      <span key={m} className="text-xs font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded capitalize">
                        {m}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`
                    text-xs font-bold px-2 py-0.5 rounded
                    ${u.activo
                      ? 'bg-verde-light text-verde'
                      : 'bg-rojo-light text-rojo'
                    }
                  `}>
                    {u.activo ? '✓ Activo' : '✕ Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => {
                        // Hidrato el state de edición con `addons` derivados
                        // de los permisos y con rol_key/personalizado (si el
                        // perfil es anterior a los roles editables, salen de
                        // rol_base).
                        const rolBase = u.rol_base ?? null
                        const addons  = deriveAddons(rolBase, u.permisos)
                        setEditando({
                          ...u,
                          rol_base:      rolBase,
                          obras_scope:   u.obras_scope ?? 'todas',
                          rol_key:       rolKeyDe(u),
                          personalizado: esPersonalizado(u),
                          addons,
                        })
                        setRolOriginal(u.rol)
                      }}
                      className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => { setResetId(u.id); setNewPass('') }}
                      className="text-xs font-bold px-2 py-1 rounded hover:bg-amarillo-light transition-colors"
                      title="Cambiar contraseña"
                    >
                      🔑
                    </button>
                    {u.id !== profileActual?.id && (
                      <button
                        onClick={() => {
                          iniciarSimulacion(u)
                          router.push('/')
                        }}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-azul-light hover:text-azul-mid transition-colors"
                        title="Simular como este usuario (solo afecta lo que se ve, no la data del backend)"
                      >
                        👁
                      </button>
                    )}
                    {u.id !== profileActual?.id && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2">
        {isLoading ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            Cargando...
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm italic">
            Sin resultados para &quot;{busqueda}&quot;.
          </div>
        ) : usuariosFiltrados.map(u => {
          const addons = deriveAddons(u.rol_base ?? null, u.permisos)
          return (
            <div key={u.id} className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-sm flex-shrink-0">
                  {u.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-carbon truncate">
                    {u.nombre}
                    {u.id === profileActual?.id && (
                      <span className="ml-1.5 text-[10px] text-naranja font-bold">(Vos)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gris-dark truncate">{(u as { email?: string | null }).email ?? '—'}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${u.activo ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'}`}>
                  {u.activo ? '✓' : '✕'}
                </span>
              </div>

              {/* Rol y addons */}
              <div className="flex flex-wrap gap-1">
                {u.rol === 'admin' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]">⭐ Admin</span>
                ) : rolKeyDe(u) ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                    {rolLabel(u)}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">⚙ Personalizado</span>
                )}
                {u.rol !== 'admin' && rolKeyDe(u) && esPersonalizado(u) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amarillo-light text-[#7A5500]">ajustes propios</span>
                )}
                {addons.map(addonKey => (
                  <span
                    key={addonKey}
                    className="text-[10px] font-bold text-naranja-dark bg-naranja-light px-2 py-0.5 rounded"
                  >
                    ＋ {addonLabel(addonKey)}
                  </span>
                ))}
              </div>

              {/* Módulos */}
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide self-center">Módulos:</span>
                {u.rol === 'admin' ? (
                  <span className="text-[10px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">Todos</span>
                ) : u.modulos.length === 0 ? (
                  <span className="text-[10px] text-gris-mid">Sin acceso</span>
                ) : u.modulos.map(m => (
                  <span key={m} className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded capitalize">{m}</span>
                ))}
              </div>

              {/* Acciones */}
              <div className="flex gap-1 justify-end pt-1 border-t border-gris">
                <button
                  onClick={() => {
                    const rolBase = u.rol_base ?? null
                    const addonsList = deriveAddons(rolBase, u.permisos)
                    setEditando({
                      ...u,
                      rol_base:      rolBase,
                      obras_scope:   u.obras_scope ?? 'todas',
                      rol_key:       rolKeyDe(u),
                      personalizado: esPersonalizado(u),
                      addons:        addonsList,
                    })
                    setRolOriginal(u.rol)
                  }}
                  className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                  title="Editar"
                >
                  ✏️
                </button>
                <button
                  onClick={() => { setResetId(u.id); setNewPass('') }}
                  className="text-xs font-bold px-2 py-1 rounded hover:bg-amarillo-light transition-colors"
                  title="Cambiar contraseña"
                >
                  🔑
                </button>
                {u.id !== profileActual?.id && (
                  <button
                    onClick={() => { iniciarSimulacion(u); router.push('/') }}
                    className="text-xs font-bold px-2 py-1 rounded hover:bg-azul-light hover:text-azul-mid transition-colors"
                    title="Simular como este usuario"
                  >
                    👁
                  </button>
                )}
                {u.id !== profileActual?.id && (
                  <button
                    onClick={() => handleDelete(u)}
                    className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal nuevo usuario */}
      <Modal
        open={modalNuevo}
        onClose={() => { setModalNuevo(false); setNuevoForm(EMPTY_NUEVO) }}
        title="👤 NUEVO USUARIO"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalNuevo(false); setNuevoForm(EMPTY_NUEVO) }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={creating}
              onClick={() => {
                const doCreate = () => create(nuevoForm)
                // Si se está creando directo como admin, pedir confirmación.
                if (nuevoForm.rol === 'admin') {
                  setConfirmAdmin({
                    nombre: nuevoForm.nombre || nuevoForm.email,
                    onConfirm: doCreate,
                  })
                } else {
                  doCreate()
                }
              }}
              disabled={!nuevoForm.email || !nuevoForm.password || !nuevoForm.nombre}
            >
              ✓ Crear usuario
            </Button>
          </>
        }
      >
        <UsuarioForm
          data={nuevoForm}
          modulos={modulos}
          onChange={(d) => setNuevoForm(d as NuevoUsuario)}
          showPassword
        />
        {/* Aviso si el usuario va a quedar con scope='asignadas' (global o por
            override de algún addon). En creación no podemos asignar obras
            todavía (no existe el id), así que dirigimos al admin a
            re-abrir el usuario después de crear. */}
        {nuevoForm.rol !== 'admin' && (
          nuevoForm.obras_scope === 'asignadas' ||
          Object.values(nuevoForm.permisos ?? {}).some(p =>
            (p as { obras_scope?: string })?.obras_scope === 'asignadas'
          )
        ) && (
          <div className="mt-4 bg-amarillo-light border border-amarillo/40 rounded-lg p-3 text-[#7A5500] text-xs">
            <div className="font-bold mb-1">⚠ Falta asignar obras</div>
            <div>
              Este rol/configuración requiere que asignes obras explícitamente.
              <strong> Después de crear al usuario</strong>, abrí su perfil con el ✏️
              y asignale las obras correspondientes — sin esto, el usuario no
              va a ver datos en los módulos restringidos.
            </div>
          </div>
        )}
      </Modal>

      {/* Modal editar */}
      {editando && (
        <Modal
          open={true}
          onClose={() => setEditando(null)}
          title="✏️ EDITAR USUARIO"
          width="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button
                variant="primary"
                loading={updating}
                onClick={() => {
                  // `permisosDto` limpia todo si el rol final es admin
                  // (defensa en profundidad aunque el wizard ya lo haga al
                  // elegir la card "Administrador") y normaliza
                  // rol_key/personalizado. Sin `modulos` ni `tipo_usuario`.
                  const dto: ActualizarUsuarioDto = {
                    nombre: editando.nombre,
                    email:  editando.email || undefined,
                    activo: editando.activo,
                    ...permisosDto(editando),
                  }
                  const doUpdate = () => update({ id: editando.id, dto })
                  // Si se está promoviendo a admin (operador → admin), pedir
                  // doble confirmación. No aplica si ya era admin (cambios
                  // dentro del mismo rol).
                  if (editando.rol === 'admin' && rolOriginal !== 'admin') {
                    setConfirmAdmin({
                      nombre: editando.nombre,
                      onConfirm: doUpdate,
                    })
                  } else {
                    doUpdate()
                  }
                }}
              >
                ✓ Guardar
              </Button>
            </>
          }
        >
          <UsuarioForm
            data={editando}
            modulos={modulos}
            onChange={(d) => setEditando(d as EditandoState)}
          />
          {/* Las obras asignadas solo importan si el scope es 'asignadas'.
              Para 'todas' ocultamos la sección — sería ruido (la lista no
              se usa para filtrar). El admin puede cambiar el scope arriba
              en el wizard si necesita restringir. */}
          {editando.rol !== 'admin' && editando.obras_scope === 'asignadas' && (
            <UsuarioObrasSection user={editando} />
          )}
        </Modal>
      )}

      {/* Modal cambiar contraseña */}
      {(() => {
        const passLargoOk     = newPass.length >= 6
        const coincide        = newPass === newPassConfirm
        const confirmTocado   = newPassConfirm.length > 0
        const puedeGuardar    = passLargoOk && coincide && confirmTocado
        const errorConfirm    = confirmTocado && !coincide ? 'No coincide con la nueva contraseña.' : undefined
        return (
          <Modal
            open={!!resetId}
            onClose={cerrarModalPassword}
            title="🔑 CAMBIAR CONTRASEÑA"
            footer={
              <>
                <Button variant="secondary" onClick={cerrarModalPassword}>Cancelar</Button>
                <Button
                  variant="primary"
                  loading={resetting}
                  disabled={!puedeGuardar}
                  onClick={() => resetId && resetPassword({ id: resetId, password: newPass })}
                >
                  Cambiar
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gris-dark">
                Usuario: <strong>{(usuarios as Profile[]).find(u => u.id === resetId)?.nombre ?? ''}</strong>
              </p>

              {/* Wrapper relativo para superponer el botón ojo al input.
                  El padding-right del input deja espacio para el botón. */}
              <div className="relative">
                <Input
                  label="Nueva contraseña"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  hint={!passLargoOk && newPass.length > 0 ? `Faltan ${6 - newPass.length} caracteres.` : undefined}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPass ? 'Ocultar' : 'Mostrar'}
                  className="absolute right-2 top-[26px] h-9 w-9 flex items-center justify-center rounded hover:bg-gris transition-colors text-base"
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>

              <div className="relative">
                <Input
                  label="Confirmar contraseña"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Repetí la contraseña"
                  value={newPassConfirm}
                  onChange={e => setNewPassConfirm(e.target.value)}
                  error={errorConfirm}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPass ? 'Ocultar' : 'Mostrar'}
                  className="absolute right-2 top-[26px] h-9 w-9 flex items-center justify-center rounded hover:bg-gris transition-colors text-base"
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Modal de doble confirmación para promoción a admin */}
      <Modal
        open={!!confirmAdmin}
        onClose={() => { setConfirmAdmin(null); setConfirmAdminText('') }}
        title="⚠ CONFIRMAR PROMOCIÓN A ADMIN"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setConfirmAdmin(null); setConfirmAdminText('') }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={confirmAdminText.trim().toUpperCase() !== 'ADMIN'}
              onClick={() => {
                confirmAdmin?.onConfirm()
                setConfirmAdmin(null)
                setConfirmAdminText('')
              }}
            >
              ✓ Confirmar promoción
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="bg-amarillo-light border border-amarillo/40 rounded-lg p-3 text-[#7A5500] text-sm">
            <p className="font-bold mb-1">Estás otorgando acceso TOTAL al sistema</p>
            <p className="text-xs">
              Vas a hacer admin a <b>{confirmAdmin?.nombre}</b>. Un admin puede:
            </p>
            <ul className="text-xs list-disc ml-5 mt-1 space-y-0.5">
              <li>Ver, crear, editar y eliminar TODA la información (todas las obras, costos, salarios, finanzas).</li>
              <li>Cambiar permisos de cualquier usuario, incluyéndote a vos.</li>
              <li>Eliminar usuarios.</li>
              <li>Acceder a todos los módulos (logística, caja, compras y stock, herramientas).</li>
            </ul>
          </div>
          <div>
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">
              Para confirmar, tipeá <span className="font-mono bg-gris px-1.5 py-0.5 rounded text-carbon">ADMIN</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              value={confirmAdminText}
              onChange={e => setConfirmAdminText(e.target.value)}
              autoFocus
              className="mt-1 w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja"
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Formulario reutilizable ──
function UsuarioForm({
  data, modulos, onChange, showPassword = false,
}: {
  data:         NuevoUsuario | (Profile & { addons: string[]; email?: string })
  modulos:      Modulo[]
  onChange:     (d: NuevoUsuario | (Profile & { addons: string[]; email?: string })) => void
  showPassword?: boolean
}) {
  // Adapter: el wizard recibe/emite WizardData; el form maneja un superset.
  const wizardData: WizardData = {
    rol:           data.rol,
    rol_key:       data.rol_key ?? null,
    rol_base:      data.rol_base ?? null,
    personalizado: data.personalizado ?? false,
    obras_scope:   data.obras_scope ?? 'todas',
    addons:        data.addons,
    permisos:      data.permisos,
  }
  const onWizardChange = (patch: Partial<WizardData>) => {
    onChange({ ...data, ...patch } as typeof data)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Nombre */}
      <Input
        label="Nombre"
        placeholder="Juan Pérez"
        value={data.nombre}
        onChange={e => onChange({ ...data, nombre: e.target.value })}
      />

      {/* Email + Contraseña — en creación */}
      {showPassword && (
        <>
          <Input
            label="Email"
            type="email"
            placeholder="juan@empresa.com"
            value={(data as NuevoUsuario).email}
            onChange={e => onChange({ ...data, email: e.target.value } as typeof data)}
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={(data as NuevoUsuario).password}
            onChange={e => onChange({ ...data, password: e.target.value } as typeof data)}
            hint="El usuario podrá cambiarla después"
          />
        </>
      )}

      {/* Email — en edición */}
      {!showPassword && (
        <Input
          label="Email"
          type="email"
          placeholder="juan@empresa.com"
          value={(data as { email?: string }).email ?? ''}
          onChange={e => onChange({ ...data, email: e.target.value } as typeof data)}
        />
      )}

      {/* Wizard de permisos — reemplaza el dropdown de plantillas, módulos
          y matriz CRUD. Maneja: rol (admin/preset/personalizado),
          obras_scope, add-ons y, si es personalizado, edición fina. */}
      <PermisosWizard
        data={wizardData}
        onChange={onWizardChange}
        modulos={modulos}
      />

      {/* Estado — solo en edición */}
      {'activo' in data && (
        <div className="flex items-center justify-between p-3 bg-gris rounded-xl">
          <div>
            <div className="font-bold text-sm text-carbon">Estado</div>
            <div className="text-xs text-gris-dark">Los usuarios inactivos no pueden ingresar</div>
          </div>
          <button
            onClick={() => onChange({ ...data, activo: !(data as Profile).activo } as typeof data)}
            className={`
              relative w-12 h-6 rounded-full transition-colors
              ${(data as Profile).activo ? 'bg-verde' : 'bg-gris-mid'}
            `}
          >
            <span className={`
              absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
              ${(data as Profile).activo ? 'translate-x-6' : 'translate-x-0.5'}
            `} />
          </button>
        </div>
      )}

    </div>
  )
}