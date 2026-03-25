import { GuardWrapper } from '@/components/GuardWrapper'
import { DashboardPage } from '@/modules/dashboard/components/DashboardPage'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <DashboardPage />
    </GuardWrapper>
  )
}