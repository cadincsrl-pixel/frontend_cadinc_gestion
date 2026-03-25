'use client'

import { useState } from 'react'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="h-dvh flex flex-col">
      <Topbar
        showMenuBtn={true}
        onMenuToggle={() => setSidebarOpen(p => !p)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar desktop — siempre visible */}
        <div className="hidden md:block w-[260px] flex-shrink-0 overflow-y-auto bg-azul">
          <Sidebar />
        </div>
        {/* Sidebar mobile — drawer */}
        <div className="md:hidden">
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
        {/* Contenido principal */}
        <main className="flex-1 overflow-y-auto bg-gris">
          {children}
        </main>
      </div>
    </div>
  )
}