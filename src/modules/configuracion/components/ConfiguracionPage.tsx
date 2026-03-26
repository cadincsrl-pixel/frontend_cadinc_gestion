'use client'

import { useState } from 'react'
import { TarjaTopbarActions } from '@/modules/tarja/components/TarjaTopbarActions'
import { CategoriasTab } from './CategoriasTab'
import { UsuariosTab }   from './UsuariosTab'
import { useSessionStore } from '@/store/session.store'

type Tab = 'categorias' | 'usuarios'

export function ConfiguracionPage() {
  const [tab,  setTab]  = useState<Tab>('categorias')
  const isAdmin = useSessionStore(s => s.isAdmin)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <TarjaTopbarActions />

      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">
          CONFIGURACIÓN
        </h1>
        <p className="text-sm text-gris-dark mt-0.5">
          Categorías, tarifas y gestión de usuarios
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-card shadow-card p-1.5 w-fit">
        <button
          onClick={() => setTab('categorias')}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
            ${tab === 'categorias'
              ? 'bg-azul text-white shadow-sm'
              : 'text-gris-dark hover:bg-gris hover:text-carbon'
            }
          `}
        >
          💼 Categorías
        </button>
        {isAdmin() && (
          <button
            onClick={() => setTab('usuarios')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
              ${tab === 'usuarios'
                ? 'bg-azul text-white shadow-sm'
                : 'text-gris-dark hover:bg-gris hover:text-carbon'
              }
            `}
          >
            👥 Usuarios
          </button>
        )}
      </div>

      {tab === 'categorias' && <CategoriasTab />}
      {tab === 'usuarios'   && isAdmin() && <UsuariosTab />}
    </div>
  )
}