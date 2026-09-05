import { HerrCatalogo } from '@/modules/herramientas/components/HerrCatalogo'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return <GuardWrapper modulo="herramientas" tabRequerido="catalogo"><HerrCatalogo /></GuardWrapper>
}
