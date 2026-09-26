import { Suspense } from 'react'
import { SueldosPage } from '@/modules/sueldos/components/SueldosPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="sueldos">
      <Suspense>
        <SueldosPage />
      </Suspense>
    </GuardWrapper>
  )
}
