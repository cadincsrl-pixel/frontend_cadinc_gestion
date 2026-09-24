import { Shell }         from '@/components/layout/Shell'
import { ProfileLoader } from '@/components/ProfileLoader'
import { SinAutofill }   from '@/components/SinAutofill'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProfileLoader>
      <SinAutofill />
      <Shell>{children}</Shell>
    </ProfileLoader>
  )
}