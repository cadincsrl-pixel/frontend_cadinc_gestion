import { GuardWrapper } from '@/components/GuardWrapper'
import { AlquilerPage } from '@/modules/alquiler/components/AlquilerPage'

export default function Page() {
  return (
    <GuardWrapper modulo="alquiler">
      <AlquilerPage />
    </GuardWrapper>
  )
}
