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
import { getPlantilla, deriveAddons, getAddOn } from '@/lib/permisos/plantillas'
import type { RolBase, ObrasScope } from '@/lib/permisos/plantillas'

// Etiqueta corta del addon para los chips de la tabla. Cae al key si el
// addon ya no existe en el catálogo (ej. addon viejo deprecado).
function addonLabel(key: string): string {
  return getAddOn(key)?.label ?? key
}
import type { Permisos, Profile, Modulo } from '@/types/domain.types'

interface NuevoUsuario {
  email:        string
  password:     string
  nombre:       string
  rol:          'admin' | 'operador'
  modulos:      string[]
  permisos:     Permisos
  rol_base:     RolBase | null
  obras_scope:  ObrasScope
  addons:       string[]
  tipo_usuario?: string | null
}

const EMPTY_NUEVO: NuevoUsuario = {
  email:        '',
  password:     '',
  nombre:       '',
  rol:          'operador',
  modulos:      [],
  permisos:     {},
  rol_base:     null,
  obras_scope:  'todas',
  addons:       [],
  tipo_usuario: null,
}

// `deriveAddons` se importa de `lib/permisos/plantillas.ts` (inspecciona
// `permisos` directamente para cubrir los 4 addons, no solo los 2
// "supervisor" que tenían tipo_usuario legacy).

export function UsuariosTab() {
  const toast        = useToast()
  const qc           = useQueryClient()
  const profileActual = useSessionStore(s => s.profile)
  const iniciarSimulacion = useSessionStore(s => s.iniciarSimulacion)
  const router = useRouter()

  // El estado de edición extiende Profile con `addons` (no se persiste en
  // DB; lo derivamos del tipo_usuario al abrir el modal y lo usa el wizard
  // para mostrar qué add-ons tiene activos).
  type EditandoState = Profile & { addons: string[]; email?: string }
  const [editando,    setEditando]    = useState<EditandoState | null>(null)
  const [rolOriginal, setRolOriginal] = useState<string | null>(null)
  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [nuevoForm,   setNuevoForm]   = useState<NuevoUsuario>(EMPTY_NUEVO)
  const [resetId,     setResetId]     = useState<string | null>(null)
  const [newPass,     setNewPass]     = useState('')
  const [busqueda,    setBusqueda]    = useState('')

  // Modal de confirmación cuando se está promocionando a un usuario a admin.
  // Pide tipear "ADMIN" para evitar privilege escalation accidental.
  const [confirmAdmin, setConfirmAdmin] = useState<{
    nombre: string
    onConfirm: () => void
  } | null>(null)
  const [confirmAdminText, setConfirmAdminText] = useState('')

  const { mutate: resetPassword, isPending: resetting } = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiPost(`/api/usuarios/${id}/reset-password`, { password }),
    onSuccess: () => { toast('Contraseña actualizada', 'ok'); setResetId(null); setNewPass('') },
    onError: (e: any) => toast(e.message || 'Error', 'err'),
  })

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
  })

  // Filtrado client-side: matchea contra nombre, email, rol, rol_base,
  // tipo_usuario y módulos. Case-insensitive. Sin filtro = todos.
  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(u => {
      const haystack = [
        u.nombre,
        (u as { email?: string }).email,
        u.rol,
        u.rol_base,
        u.tipo_usuario,
        ...(u.modulos ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [usuarios, busqueda])

  // Módulos: fuente única en `src/lib/config/modulos.ts`. El endpoint
  // `/api/usuarios/modulos` ya no se consume porque la tabla `modulos` fue
  // eliminada en la migración Permisos v3 (ver feat/permisos-v3).
  const modulos: Modulo[] = modulosOrdenados({ incluirAdmin: true }).map((m, idx) => ({
    id:          idx,
    key:         m.key,
    nombre:      m.label,
    descripcion: m.descripcion,
    icono:       m.icono,
    activo:      true,
    orden:       m.orden,
  }))

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (dto: NuevoUsuario) => apiPost('/api/usuarios', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast('✓ Usuario creado', 'ok')
      setModalNuevo(false)
      setNuevoForm(EMPTY_NUEVO)
    },
    onError: (e: any) => toast(e.message ?? 'Error al crear usuario', 'err'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<Profile> & { email?: string } }) =>
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
    onError: (e: any) => toast(e.message ?? 'Error al eliminar', 'err'),
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
                  Sin resultados para "{busqueda}".
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
                        {/* Badge principal: rol_base si está, si no tipo_usuario legacy. */}
                        {u.rol_base && (
                          <span className="text-[10px] font-bold text-azul-mid bg-azul-light px-1.5 py-0.5 rounded">
                            {getPlantilla(u.rol_base)?.label ?? u.rol_base}
                          </span>
                        )}
                        {!u.rol_base && u.tipo_usuario && u.tipo_usuario !== 'personalizado' && (
                          <span className="text-[10px] font-bold text-azul-mid bg-azul-light px-1.5 py-0.5 rounded">
                            {/* Alias legacy: 'encargado_deposito' (CHECK)
                                ↔ 'deposito' (preset key). */}
                            {getPlantilla(u.tipo_usuario === 'encargado_deposito' ? 'deposito' : u.tipo_usuario)?.label ?? u.tipo_usuario}
                          </span>
                        )}
                        {u.tipo_usuario === 'personalizado' && (
                          <span className="text-[10px] font-bold text-gris-dark bg-gris px-1.5 py-0.5 rounded">
                            ⚙ Personalizado
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
                <td className="px-4 py-3 text-xs text-gris-dark">{(u as any).email ?? '—'}</td>
                <td className="px-4 py-3">
                  {(() => {
                    if (u.rol === 'admin') {
                      return (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]">
                          ⭐ Admin
                        </span>
                      )
                    }
                    // Preset v2 (rol_base seteado).
                    if (u.rol_base) {
                      return (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                          {getPlantilla(u.rol_base)?.label ?? u.rol_base}
                        </span>
                      )
                    }
                    // Personalizado explícito.
                    if (u.tipo_usuario === 'personalizado') {
                      return (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">
                          ⚙ Personalizado
                        </span>
                      )
                    }
                    // Legacy: tipo_usuario sin rol_base (alias 'encargado_deposito' → 'deposito').
                    if (u.tipo_usuario) {
                      const presetKey = u.tipo_usuario === 'encargado_deposito' ? 'deposito' : u.tipo_usuario
                      return (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                          {getPlantilla(presetKey)?.label ?? u.tipo_usuario}
                        </span>
                      )
                    }
                    // Fallback: operador legacy sin nada seteado.
                    return (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">
                        Operador
                      </span>
                    )
                  })()}
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
                        // Hidrato el state de edición con `addons` derivados.
                        // Si rol_base no está seteado (perfil legacy o
                        // 'personalizado'), tratamos al usuario como
                        // personalizado: rol_base=null, addons=[].
                        const rolBase = (u.rol_base ?? null) as RolBase | null
                        const addons  = deriveAddons(rolBase, u.permisos)
                        setEditando({
                          ...u,
                          rol_base:    rolBase,
                          obras_scope: u.obras_scope ?? 'todas',
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
            Sin resultados para "{busqueda}".
          </div>
        ) : usuariosFiltrados.map(u => {
          const addons = deriveAddons((u.rol_base ?? null) as RolBase | null, u.permisos)
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
                  <div className="text-[11px] text-gris-dark truncate">{(u as any).email ?? '—'}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${u.activo ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'}`}>
                  {u.activo ? '✓' : '✕'}
                </span>
              </div>

              {/* Rol y addons */}
              <div className="flex flex-wrap gap-1">
                {u.rol === 'admin' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]">⭐ Admin</span>
                ) : u.rol_base ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                    {getPlantilla(u.rol_base)?.label ?? u.rol_base}
                  </span>
                ) : u.tipo_usuario === 'personalizado' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">⚙ Personalizado</span>
                ) : u.tipo_usuario ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-azul-light text-azul-mid">
                    {getPlantilla(u.tipo_usuario === 'encargado_deposito' ? 'deposito' : u.tipo_usuario)?.label ?? u.tipo_usuario}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">Operador</span>
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
                    const rolBase = (u.rol_base ?? null) as RolBase | null
                    const addonsList = deriveAddons(rolBase, u.permisos)
                    setEditando({ ...u, rol_base: rolBase, obras_scope: u.obras_scope ?? 'todas', addons: addonsList })
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
                  // Defensa en profundidad: si el rol final es admin,
                  // forzamos limpieza de permisos/modulos/rol_base aunque
                  // el wizard ya lo haga al elegir la card "Admin". Evita
                  // que queden residuos si el admin abre el modal y solo
                  // cambia el rol con el toggle viejo (que ya no existe
                  // pero queda como guardia futura).
                  const dto: Partial<Profile> & { email?: string } = editando.rol === 'admin'
                    ? {
                        nombre:       editando.nombre,
                        email:        editando.email || undefined,
                        rol:          'admin',
                        modulos:      [],
                        activo:       editando.activo,
                        permisos:     {},
                        rol_base:     null,
                        obras_scope:  'todas',
                        tipo_usuario: null,
                      }
                    : {
                        nombre:       editando.nombre,
                        email:        editando.email || undefined,
                        rol:          editando.rol,
                        modulos:      editando.modulos,
                        activo:       editando.activo,
                        permisos:     editando.permisos,
                        rol_base:     editando.rol_base,
                        obras_scope:  editando.obras_scope,
                        tipo_usuario: editando.tipo_usuario ?? null,
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
      <Modal
        open={!!resetId}
        onClose={() => { setResetId(null); setNewPass('') }}
        title="🔑 CAMBIAR CONTRASEÑA"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setResetId(null); setNewPass('') }}>Cancelar</Button>
            <Button
              variant="primary"
              loading={resetting}
              disabled={newPass.length < 6}
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
          <Input
            label="Nueva contraseña"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
          />
        </div>
      </Modal>

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
    rol:          data.rol,
    rol_base:     ((data as Partial<Profile>).rol_base ?? null) as RolBase | null,
    obras_scope:  ((data as Partial<Profile>).obras_scope ?? 'todas') as ObrasScope,
    addons:       (data as { addons?: string[] }).addons ?? [],
    modulos:      data.modulos,
    permisos:     data.permisos,
    tipo_usuario: data.tipo_usuario ?? null,
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