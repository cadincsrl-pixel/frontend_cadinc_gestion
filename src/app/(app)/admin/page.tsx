import { GuardWrapper } from '@/components/GuardWrapper'
import { AdminPage } from '@/modules/admin/components/AdminPage'

export default function Page() {
  return (
    <GuardWrapper modulo="admin">
      <AdminPage />
    </GuardWrapper>
  )
}
