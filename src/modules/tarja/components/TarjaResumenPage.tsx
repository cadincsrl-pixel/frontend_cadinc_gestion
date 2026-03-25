'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ModalNuevaObra } from './ModalNuevaObra'

export function TarjaResumenPage() {
  const router = useRouter()
  const { data: obras = [], isLoading } = useObras()
  const [modalObra, setModalObra] = useState(false)

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando obras...
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">
            OBRAS ACTIVAS
          </h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {obras.length} obras en curso
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalObra(true)}>
          ＋ Nueva obra
        </Button>
      </div>

      {obras.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark">
          No hay obras activas. Creá la primera.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {obras.map(obra => (
            <button
              key={obra.cod}
              onClick={() => router.push(`/tarja/${encodeURIComponent(obra.cod)}`)}
              className="bg-white rounded-card shadow-card hover:shadow-card-lg hover:-translate-y-0.5 transition-all text-left p-4 border-l-[5px] border-naranja"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gris-dark bg-gris px-2 py-0.5 rounded">
                      {obra.cod}
                    </span>
                    <Badge variant="activo" label="Activa" />
                  </div>
                  <h2 className="font-bold text-azul text-base">{obra.nom}</h2>
                  {obra.dir && (
                    <p className="text-sm text-gris-dark mt-0.5">{obra.dir}</p>
                  )}
                </div>
                {obra.resp && (
                  <span className="text-xs bg-azul-light text-azul-mid font-semibold px-2 py-1 rounded-lg">
                    👷 {obra.resp}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <ModalNuevaObra
        open={modalObra}
        onClose={() => setModalObra(false)}
      />
    </div>
  )
}