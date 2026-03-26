import { HerrDashboard } from '@/modules/herramientas/components/HerrDashboard'
import { GuardWrapper }  from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrDashboard /></GuardWrapper>
}