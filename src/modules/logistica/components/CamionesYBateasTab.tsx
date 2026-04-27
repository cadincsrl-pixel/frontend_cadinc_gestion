'use client'

import { useState } from 'react'
import { CamionesTab } from './CamionesTab'
import { BateasTab }   from './BateasTab'

type SubTab = 'camiones' | 'bateas'

export function CamionesYBateasTab() {
  const [sub, setSub] = useState<SubTab>('camiones')

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gris pb-0">
        {([['camiones', '🚚 Camiones'], ['bateas', '🛻 Bateas']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors border border-b-0 ${
              sub === k
                ? 'bg-white border-gris text-azul shadow-sm -mb-px'
                : 'bg-gris border-transparent text-gris-dark hover:text-carbon'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === 'camiones' && <CamionesTab />}
      {sub === 'bateas'   && <BateasTab />}
    </div>
  )
}
