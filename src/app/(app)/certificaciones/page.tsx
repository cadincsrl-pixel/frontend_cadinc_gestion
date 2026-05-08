import { Suspense } from 'react'
import { CertificacionesPage } from '@/modules/certificaciones/components/CertificacionesPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="certificaciones">
      <Suspense>
        <CertificacionesPage />
      </Suspense>
    </GuardWrapper>
  )
}
