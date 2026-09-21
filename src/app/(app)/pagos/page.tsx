import { Suspense } from 'react'
import { PagosPage } from '@/modules/pagos/components/PagosPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="pagos">
      <Suspense>
        <PagosPage />
      </Suspense>
    </GuardWrapper>
  )
}
