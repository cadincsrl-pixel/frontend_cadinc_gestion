import { Shell }         from '@/components/layout/Shell'
import { ProfileLoader } from '@/components/ProfileLoader'
import { SinAutofill }   from '@/components/SinAutofill'
import { EmpresaLoader } from '@/components/EmpresaLoader'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProfileLoader>
      <SinAutofill />
      <EmpresaLoader />
      <Shell>{children}</Shell>
    </ProfileLoader>
  )
}