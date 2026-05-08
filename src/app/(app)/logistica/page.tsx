import { Suspense } from 'react'
import { LogisticaPage } from '@/modules/logistica/components/LogisticaPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="logistica">
      <Suspense>
        <LogisticaPage />
      </Suspense>
    </GuardWrapper>
  )
}
