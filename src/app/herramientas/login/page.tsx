import { LoginPage } from '@/components/LoginPage'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <LoginPage redirectTo="/herramientas" />
}