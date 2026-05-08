import { ObrasArchivadasPage } from '@/modules/tarja/components/ObrasArchivadasPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja" tabRequerido="archivadas">
      <ObrasArchivadasPage />
    </GuardWrapper>
  )
}
