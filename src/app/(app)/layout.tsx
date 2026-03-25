import { Shell }         from '@/components/layout/Shell'
import { ProfileLoader } from '@/components/ProfileLoader'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProfileLoader>
      <Shell>{children}</Shell>
    </ProfileLoader>
  )
}