import { RopaPage } from '@/modules/tarja/components/RopaPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja" tabRequerido="ropa">
      <RopaPage />
    </GuardWrapper>
  )
}
