import { GuardWrapper } from '@/components/GuardWrapper'
import { AridosPage } from '@/modules/aridos/components/AridosPage'

export default function Page() {
  return (
    <GuardWrapper modulo="aridos">
      <AridosPage />
    </GuardWrapper>
  )
}
