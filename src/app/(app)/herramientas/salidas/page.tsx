import { HerrSalidas } from '@/modules/herramientas/components/HerrSalidas'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrSalidas /></GuardWrapper>
}
