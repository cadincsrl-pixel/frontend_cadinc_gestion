import { GuardWrapper } from '@/components/GuardWrapper'
import { CostosOficinaGuard } from '@/modules/dashboard/components/CostosOficinaGuard'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <CostosOficinaGuard />
    </GuardWrapper>
  )
}
