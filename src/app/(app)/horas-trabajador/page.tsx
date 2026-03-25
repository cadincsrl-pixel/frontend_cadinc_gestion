import { HorasTrabajadorPage } from '@/modules/tarja/components/HorasTrabajadorPage'
import { GuardWrapper }        from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <HorasTrabajadorPage />
    </GuardWrapper>
  )
}