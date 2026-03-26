import { HerrParametros } from '@/modules/herramientas/components/HerrParametros'
import { GuardWrapper }   from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrParametros /></GuardWrapper>
}