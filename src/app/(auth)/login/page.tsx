import { LoginPage } from '@/components/LoginPage'

// LoginPage usa useSearchParams() para leer ?error=sin-modulos. Eso requiere
// que la página sea dinámica (no prerender estático) en Next.js 16.
export const dynamic = 'force-dynamic'

export default function Page() {
  return <LoginPage />
}