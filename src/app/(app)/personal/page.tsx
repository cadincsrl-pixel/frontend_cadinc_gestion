import { PersonalPage } from '@/modules/personal/components/PersonalPage'
import { GuardWrapper } from '@/components/GuardWrapper'

export default function Page() {
  return (
    <GuardWrapper modulo="tarja">
      <PersonalPage />
    </GuardWrapper>
  )
}