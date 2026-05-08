import { GuardWrapper } from '@/components/GuardWrapper'
import { TarjaObraPage } from '@/modules/tarja/components/TarjaObraPage'

interface Props {
  params: Promise<{ obraCod: string }>
}

export default async function Page({ params }: Props) {
  const { obraCod } = await params
  const cod = decodeURIComponent(obraCod)
  return (
    <GuardWrapper modulo="tarja" tabRequerido="tarja">
      <TarjaObraPage obraCod={cod} />
    </GuardWrapper>
  )
}