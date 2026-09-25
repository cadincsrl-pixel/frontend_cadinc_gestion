'use client'

import { useEmpresa } from '@/hooks/useEmpresa'

/**
 * Trae los Datos de la empresa al entrar a la app y los vuelca en `EMPRESA`
 * (tanda 6). No renderiza nada. El login sigue con los defaults (es pre-auth).
 */
export function EmpresaLoader() {
  useEmpresa()
  return null
}
