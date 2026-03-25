'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useSessionStore } from '@/store/session.store'
import type { Profile, Modulo } from '@/types/domain.types'

interface NuevoUsuario {
  email:    string
  password: string
  nombre:   string
  rol:      'admin' | 'operador'
  modulos:  string[]
}

const EMPTY_NUEVO: NuevoUsuario = {
  email:    '',
  password: '',
  nombre:   '',
  rol:      'operador',
  modulos:  [],
}

export function UsuariosTab() {
  const toast        = useToast()
  const qc           = useQueryClient()
  const profileActual = useSessionStore(s => s.profile)

  const [editando,    setEditando]    = useState<Profile | null>(null)
  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [nuevoForm,   setNuevoForm]   = useState<NuevoUsuario>(EMPTY_NUEVO)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
  })

  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos'],
    queryFn:  () => apiGet<Modulo[]>('/api/usuarios/modulos'),
  })

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
    mutationFn: ({ id, dto }: { id: string; dto: Partial<Profile> }) =>
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
            Usuarios ({usuarios.length})
          </h2>
          <p className="text-xs text-gris-dark mt-0.5">
            Gestioná roles y módulos de acceso por usuario.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo usuario
        </Button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Usuario', 'Rol', 'Módulos', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8">
                  <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                    <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </span>
                </td>
              </tr>
            ) : usuarios.map(u => (
              <tr key={u.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-sm flex-shrink-0">
                      {u.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-carbon">{u.nombre}</div>
                      {u.id === profileActual?.id && (
                        <div className="text-[10px] text-naranja font-bold">Vos</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`
                    text-xs font-bold px-2 py-0.5 rounded
                    ${u.rol === 'admin'
                      ? 'bg-[#EEE8FF] text-[#5A2D82]'
                      : 'bg-gris text-gris-dark'
                    }
                  `}>
                    {u.rol === 'admin' ? '⭐ Admin' : 'Operador'}
                  </span>
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
                      onClick={() => setEditando({ ...u })}
                      className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                    >
                      ✏️
                    </button>
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

      {/* Modal nuevo usuario */}
      <Modal
        open={modalNuevo}
        onClose={() => { setModalNuevo(false); setNuevoForm(EMPTY_NUEVO) }}
        title="👤 NUEVO USUARIO"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalNuevo(false); setNuevoForm(EMPTY_NUEVO) }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={creating}
              onClick={() => create(nuevoForm)}
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
          onChange={setNuevoForm}
          showPassword
        />
      </Modal>

      {/* Modal editar */}
      {editando && (
        <Modal
          open={true}
          onClose={() => setEditando(null)}
          title="✏️ EDITAR USUARIO"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button
                variant="primary"
                loading={updating}
                onClick={() => update({ id: editando.id, dto: {
                  nombre:  editando.nombre,
                  rol:     editando.rol,
                  modulos: editando.modulos,
                  activo:  editando.activo,
                }})}
              >
                ✓ Guardar
              </Button>
            </>
          }
        >
          <UsuarioForm
            data={editando}
            modulos={modulos}
            onChange={setEditando as any}
          />
        </Modal>
      )}
    </>
  )
}

// ── Formulario reutilizable ──
function UsuarioForm({
  data, modulos, onChange, showPassword = false,
}: {
  data:         NuevoUsuario | Profile
  modulos:      Modulo[]
  onChange:     (d: any) => void
  showPassword?: boolean
}) {
  function toggleModulo(key: string) {
    const tiene = data.modulos.includes(key)
    onChange({
      ...data,
      modulos: tiene
        ? data.modulos.filter(m => m !== key)
        : [...data.modulos, key],
    })
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

      {/* Email — solo en creación */}
      {showPassword && (
        <>
          <Input
            label="Email"
            type="email"
            placeholder="juan@empresa.com"
            value={(data as NuevoUsuario).email}
            onChange={e => onChange({ ...data, email: e.target.value })}
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={(data as NuevoUsuario).password}
            onChange={e => onChange({ ...data, password: e.target.value })}
            hint="El usuario podrá cambiarla después"
          />
        </>
      )}

      {/* Rol */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Rol</label>
        <div className="flex gap-2">
          {(['admin', 'operador'] as const).map(r => (
            <button
              key={r}
              onClick={() => onChange({ ...data, rol: r })}
              className={`
                flex-1 py-2 rounded-lg font-bold text-sm border-[1.5px] transition-all
                ${data.rol === r
                  ? r === 'admin'
                    ? 'bg-[#EEE8FF] border-[#5A2D82] text-[#5A2D82]'
                    : 'bg-azul-light border-azul text-azul'
                  : 'bg-white border-gris-mid text-gris-dark hover:border-gris-dark'
                }
              `}
            >
              {r === 'admin' ? '⭐ Admin' : '👤 Operador'}
            </button>
          ))}
        </div>
        {data.rol === 'admin' && (
          <p className="text-xs text-gris-dark mt-1">
            Los admins tienen acceso a todos los módulos automáticamente.
          </p>
        )}
      </div>

      {/* Módulos — solo si operador */}
      {data.rol === 'operador' && (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Módulos permitidos
          </label>
          <div className="flex flex-col gap-2">
            {modulos.map(m => {
              const tiene = data.modulos.includes(m.key)
              return (
                <label
                  key={m.key}
                  className={`
                    flex items-center gap-3 p-3 rounded-xl border-[1.5px] cursor-pointer transition-all
                    ${tiene
                      ? 'border-naranja bg-naranja-light'
                      : 'border-gris-mid bg-white hover:border-gris-dark'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={tiene}
                    onChange={() => toggleModulo(m.key)}
                    className="accent-naranja w-4 h-4"
                  />
                  <span className="text-2xl">{m.icono}</span>
                  <div>
                    <div className="font-bold text-sm text-carbon">{m.nombre}</div>
                    <div className="text-xs text-gris-dark">{m.descripcion}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Estado — solo en edición */}
      {'activo' in data && (
        <div className="flex items-center justify-between p-3 bg-gris rounded-xl">
          <div>
            <div className="font-bold text-sm text-carbon">Estado</div>
            <div className="text-xs text-gris-dark">Los usuarios inactivos no pueden ingresar</div>
          </div>
          <button
            onClick={() => onChange({ ...data, activo: !(data as Profile).activo })}
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