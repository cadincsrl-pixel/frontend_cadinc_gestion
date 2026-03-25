'use client'

import { useObrasArchivadas } from '@/modules/tarja/hooks/useObras'
import { Badge } from '@/components/ui/Badge'

export function ObrasArchivadasPage() {
  const { data: obras = [], isLoading } = useObrasArchivadas()

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">
          OBRAS ARCHIVADAS
        </h1>
        <p className="text-sm text-gris-dark mt-0.5">
          {obras.length} obras en el historial
        </p>
      </div>

      {obras.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay obras archivadas.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {obras.map(obra => (
            <div
              key={obra.cod}
              className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-gris-mid opacity-80"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gris-dark bg-gris px-2 py-0.5 rounded">
                      {obra.cod}
                    </span>
                    <Badge variant="inactivo" label="Archivada" />
                  </div>
                  <h2 className="font-bold text-carbon text-base">{obra.nom}</h2>
                  {obra.dir && (
                    <p className="text-sm text-gris-dark mt-0.5">{obra.dir}</p>
                  )}
                </div>
                {obra.fecha_archivo && (
                  <span className="text-xs text-gris-dark font-mono">
                    Archivada: {obra.fecha_archivo}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}