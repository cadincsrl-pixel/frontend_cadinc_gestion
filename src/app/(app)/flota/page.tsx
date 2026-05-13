import { GuardWrapper } from '@/components/GuardWrapper'
import { FlotaPage } from '@/modules/flota/components/FlotaPage'

export default function Page() {
  return (
    <GuardWrapper modulo="flota">
      <FlotaPage />
    </GuardWrapper>
  )
}
