import { GuardWrapper } from '@/components/GuardWrapper'
import { CostosTab } from '@/modules/certificaciones/components/CostosTab'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <div className="p-4 md:p-6 flex flex-col gap-4">
        <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
          <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
            📊 COSTOS
          </h1>
          <p className="text-sm text-gris-dark mt-1">Operarios y contratistas por semana</p>
        </div>
        <CostosTab />
      </div>
    </GuardWrapper>
  )
}
