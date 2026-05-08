import { Suspense } from 'react'
import { CajaPage } from '@/modules/caja/components/CajaPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="caja">
      <Suspense>
        <CajaPage />
      </Suspense>
    </GuardWrapper>
  )
}
