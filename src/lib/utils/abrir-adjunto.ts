// Abre un adjunto (signed URL de Storage) en una pestaña nueva, de forma
// compatible con la PWA instalada / navegador móvil.
//
// El bug que resuelve: en modo standalone (app agregada a la pantalla de
// inicio) llamar `window.open(url)` DESPUÉS de un `await` pierde la
// "activación por gesto del usuario" y el navegador bloquea la apertura.
// Síntoma típico: el botón "ver documento" funciona en la compu pero en el
// celu no abre nada. La solución es abrir la pestaña en blanco
// SINCRÓNICAMENTE dentro del gesto (el onClick) y recién después, cuando la
// signed URL ya está lista, redirigir esa pestaña.
//
// Uso:
//   await abrirAdjuntoFirmado(
//     () => fetchSignedUrl(...),
//     () => toast('No se pudo abrir', 'err'),
//   )
export async function abrirAdjuntoFirmado(
  obtenerUrl: () => Promise<string>,
  onError?: (e: unknown) => void,
): Promise<void> {
  // Abrir la pestaña ANTES de cualquier await: así conserva el gesto.
  const win = window.open('', '_blank')
  // Higiene: sin relación con la ventana que lo abrió (es nuestro Storage,
  // pero no hay motivo para exponer el opener).
  if (win) win.opener = null
  try {
    const url = await obtenerUrl()
    if (win && !win.closed) {
      win.location.href = url
    } else {
      // La pestaña fue bloqueada (algunos navegadores en standalone):
      // navegamos en la misma. El usuario vuelve con "atrás".
      window.location.href = url
    }
  } catch (e) {
    win?.close()
    onError?.(e)
  }
}
