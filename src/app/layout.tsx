import type { Metadata, Viewport } from 'next'
import { Syne, JetBrains_Mono, Bebas_Neue } from 'next/font/google'
import { Providers } from './providers'
import { EMPRESA } from '@/lib/config/empresa'
import './globals.css'

// Las fuentes se sirven desde nuestro propio dominio en vez de pedirlas a
// fonts.googleapis.com. Antes iban por <link> en el <head>: eso obliga al
// navegador a resolver otro dominio, bajar el CSS y recién ahí las fuentes, y
// mientras tanto la página se dibuja con la de sistema y salta cuando llegan
// (el "parpadeo" que se nota más en Windows, donde la de reemplazo es Segoe UI
// y tiene otro ancho). `next/font` las descarga en build, las sirve locales y
// calcula una fallback con las mismas métricas, así no hay salto ni pedido a
// un tercero.
const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--fuente-sans',
  display: 'swap',
})
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--fuente-mono',
  display: 'swap',
})
const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--fuente-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: `${EMPRESA.nombre} — Sistema de gestión`,
  description: `Sistema de gestión ${EMPRESA.nombre}`,
  applicationName: EMPRESA.nombre,
  // Para el ícono de la pantalla de inicio en iOS, que no lee el manifest.
  appleWebApp: { capable: true, title: EMPRESA.nombre, statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  // Pinta la barra del navegador del azul de la marca en Android y en la app
  // instalada. En Next 16 esto va en `viewport`, no en `metadata`.
  themeColor: '#0F2744',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${syne.variable} ${jetbrains.variable} ${bebas.variable}`}>
      <body className="bg-gris font-sans text-carbon antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
