'use client'

import { CategoriasTab } from './CategoriasTab'

export function ConfiguracionPage() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">
          CONFIGURACIÓN
        </h1>
        <p className="text-sm text-gris-dark mt-0.5">
          Categorías y tarifas globales de personal
        </p>
      </div>
      <CategoriasTab />
    </div>
  )
}