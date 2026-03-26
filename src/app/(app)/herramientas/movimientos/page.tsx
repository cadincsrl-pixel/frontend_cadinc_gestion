import { HerrMovimientos } from '@/modules/herramientas/components/HerrMovimientos'
import { GuardWrapper }    from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrMovimientos /></GuardWrapper>
}