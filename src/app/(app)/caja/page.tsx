import { Suspense } from 'react'
import { CajaPage } from '@/modules/caja/components/CajaPage'

export default function Page() {
  return (
    <Suspense>
      <CajaPage />
    </Suspense>
  )
}
