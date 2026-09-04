import { HerrRetornos } from '@/modules/herramientas/components/HerrRetornos'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrRetornos /></GuardWrapper>
}
