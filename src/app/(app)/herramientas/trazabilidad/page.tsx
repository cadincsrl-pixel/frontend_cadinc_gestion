import { HerrTrazabilidad } from '@/modules/herramientas/components/HerrTrazabilidad'
import { GuardWrapper }     from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrTrazabilidad /></GuardWrapper>
}