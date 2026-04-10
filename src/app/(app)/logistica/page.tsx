import { Suspense } from 'react'
import { LogisticaPage } from '@/modules/logistica/components/LogisticaPage'

export default function Page() {
  return (
    <Suspense>
      <LogisticaPage />
    </Suspense>
  )
}