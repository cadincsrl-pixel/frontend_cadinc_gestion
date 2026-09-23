import { Suspense } from 'react'
import { FacturacionPage } from '@/modules/facturacion/components/FacturacionPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="facturacion">
      <Suspense>
        <FacturacionPage />
      </Suspense>
    </GuardWrapper>
  )
}
