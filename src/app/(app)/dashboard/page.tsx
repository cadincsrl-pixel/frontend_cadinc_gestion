import { GuardWrapper } from '@/components/GuardWrapper'
import { ResumenHistoricoPage } from '@/modules/dashboard/components/ResumenHistoricoPage'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <ResumenHistoricoPage />
    </GuardWrapper>
  )
}