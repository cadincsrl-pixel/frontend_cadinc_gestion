import { GuardWrapper } from '@/components/GuardWrapper'
import { TarjaResumenPage } from '@/modules/tarja/components/TarjaResumenPage'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <TarjaResumenPage />
    </GuardWrapper>
  )
}