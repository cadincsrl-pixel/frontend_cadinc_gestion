'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            // ERP interno de uso pesado: alt-tab entre pestañas no debería
            // disparar cascadas de refetch (8+ queries por pantalla). Reconnect
            // sí — si se perdió internet momentáneamente, conviene refrescar.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      })
  )

  // Listener global del estado de auth: cuando Supabase cierra sesión
  // (SIGNED_OUT), limpia cache y redirige a /login.
  //
  // NO invalidamos queries en TOKEN_REFRESHED: apiGet/Post/etc leen el token
  // fresh de la sesión en cada request, las queries ya cacheadas siguen
  // válidas con sus datos. Invalidar generaba cascada de N refetches
  // simultáneos cada ~55 min cuando Supabase refresca el JWT.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.assign('/login?sessionExpired=1')
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {children}
      </ToastProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
