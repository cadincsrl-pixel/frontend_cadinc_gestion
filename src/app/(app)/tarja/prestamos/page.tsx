import { PrestamosPage } from '@/modules/tarja/components/PrestamosPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja" tabRequerido="prestamos">
      <PrestamosPage />
    </GuardWrapper>
  )
}
