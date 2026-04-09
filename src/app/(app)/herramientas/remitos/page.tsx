import { HerrRemitos }  from '@/modules/herramientas/components/HerrRemitos'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrRemitos /></GuardWrapper>
}
