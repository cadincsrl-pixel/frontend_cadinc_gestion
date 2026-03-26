import { HerrInventario } from '@/modules/herramientas/components/HerrInventario'
import { GuardWrapper }   from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas"><HerrInventario /></GuardWrapper>
}