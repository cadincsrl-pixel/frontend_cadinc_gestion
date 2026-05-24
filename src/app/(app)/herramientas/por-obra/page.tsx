import { HerrPorObra } from '@/modules/herramientas/components/HerrPorObra'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrPorObra /></GuardWrapper>
}
