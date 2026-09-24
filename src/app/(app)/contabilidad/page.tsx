import { Suspense } from 'react'
import { ContabilidadPage } from '@/modules/contabilidad/components/ContabilidadPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="contabilidad">
      <Suspense>
        <ContabilidadPage />
      </Suspense>
    </GuardWrapper>
  )
}
