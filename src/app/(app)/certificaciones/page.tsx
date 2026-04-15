import { Suspense } from 'react'
import { CertificacionesPage } from '@/modules/certificaciones/components/CertificacionesPage'

export default function Page() {
  return (
    <Suspense>
      <CertificacionesPage />
    </Suspense>
  )
}
