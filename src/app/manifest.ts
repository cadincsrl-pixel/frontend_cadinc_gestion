import type { MetadataRoute } from 'next'
import { EMPRESA } from '@/lib/config/empresa'

// Manifest para cuando alguien se guarda el sistema en la pantalla de inicio
// del celular. Sin esto, Android usa una captura de la página como ícono y el
// nombre completo del <title>, que es lo que se veía feo.
//
// `short_name` es el que va abajo del ícono en el escritorio: tiene que entrar
// en ~12 caracteres o el sistema lo corta con puntos suspensivos.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${EMPRESA.nombre} — Sistema de gestión`,
    short_name: EMPRESA.nombre,
    description: `Sistema de gestión de ${EMPRESA.nombre}`,
    lang: 'es-AR',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0F2744',
    theme_color: '#0F2744',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // La versión `maskable` lleva la marca al 62 % del lienzo: Android la
      // recorta con la forma del launcher (círculo, squircle) y si el dibujo
      // llega al borde le come las puntas.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
