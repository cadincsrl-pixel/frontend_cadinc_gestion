import { ConfiguracionPage } from '@/modules/configuracion/components/ConfiguracionPage'
import { GuardWrapper }      from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <ConfiguracionPage />
    </GuardWrapper>
  )
}