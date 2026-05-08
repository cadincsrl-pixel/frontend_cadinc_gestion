import { createServerClient } from '@supabase/ssr'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

// Mapa de rutas → módulo requerido.
// IMPORTANTE: solo entran las rutas que mapean 1:1 a un módulo. Las páginas de
// tarja con tabs (dashboard, personal, horas-trabajador, configuracion, etc.)
// NO van acá: las gobierna GuardWrapper con tabRequerido en su page.tsx,
// porque pueden estar permitidas o no según el array `permisos.tarja.tabs`.
const ROUTE_MODULOS: Record<string, string> = {
  '/tarja':            'tarja',
  '/herramientas':     'herramientas',
  '/logistica':        'logistica',
  '/certificaciones':  'certificaciones',
  '/caja':             'caja',
  '/admin':            'admin',
}

function getModuloRequerido(pathname: string): string | null {
  for (const [route, modulo] of Object.entries(ROUTE_MODULOS)) {
    if (pathname === route || pathname.startsWith(route + '/')) return modulo
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas públicas
  const publicRoutes = ['/', '/login', '/herramientas/login', '/logistica/login']
  if (publicRoutes.includes(pathname)) return NextResponse.next()

  // Verificar sesión
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Chequeo de módulo a nivel servidor: si la ruta requiere un módulo,
  // validamos que el usuario lo tenga en `profiles.modulos` (o sea admin).
  // Esto previene acceso por URL directa a páginas de otros módulos.
  const moduloRequerido = getModuloRequerido(pathname)
  if (moduloRequerido) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('rol, modulos')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    const esAdmin = profile.rol === 'admin'
    const tieneModulo = Array.isArray(profile.modulos) && profile.modulos.includes(moduloRequerido)
    if (!esAdmin && !tieneModulo) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
