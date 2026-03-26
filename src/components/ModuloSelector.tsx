'use client'

import { useRouter } from 'next/navigation'

const MODULOS = [
  {
    key: 'tarja',
    nombre: 'Tarja de Obra',
    descripcion: 'Control de horas y personal',
    icono: '📋',
    href: '/login',
    color: 'naranja',
  },
  {
    key: 'logistica',
    nombre: 'Logística',
    descripcion: 'Materiales y recursos',
    icono: '🚛',
    href: '/logistica/login',
    color: 'azul',
    disabled: true,
    badge: 'Próximamente',
  },
  {
    key: 'herramientas',
    nombre: 'Herramientas',
    descripcion: 'Control de herramientas y equipos',
    icono: '🔧',
    href: '/herramientas/login',
    color: 'purple',
  },
] as const

export function ModuloSelector() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="font-display text-[2.8rem] tracking-[4px] text-white flex items-center gap-3 justify-center">
          TARJA<em className="text-naranja not-italic">OBRA</em>
        </div>
        <p className="text-white/50 text-sm mt-2 tracking-wider uppercase font-semibold">
          CADINC SRL — Sistema de gestión
        </p>
      </div>

      {/* Título */}
      <div className="text-center mb-8">
        <h2 className="text-white/90 text-lg font-bold">
          Seleccioná el módulo al que querés acceder
        </h2>
        <p className="text-white/40 text-sm mt-1">
          Ingresarás con tus credenciales de acceso
        </p>
      </div>

      {/* Grid de módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {MODULOS.map(m => (
          <button
            key={m.key}
            onClick={() => !m.disabled && router.push(m.href)}
            disabled={m.disabled}
            className={`
              relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 transition-all
              ${m.disabled
                ? 'border-white/10 bg-white/5 cursor-not-allowed opacity-50'
                : 'border-white/20 bg-white/10 hover:bg-white/20 hover:border-naranja hover:scale-[1.03] cursor-pointer active:scale-[0.98]'
              }
            `}
          >
            {/* Badge */}
            {'badge' in m && m.badge && (
              <span className="absolute top-3 right-3 text-[10px] font-bold bg-white/20 text-white/70 px-2 py-0.5 rounded-full uppercase tracking-wide">
                {m.badge}
              </span>
            )}

            {/* Ícono */}
            <div className="text-5xl">{m.icono}</div>

            {/* Info */}
            <div className="text-center">
              <div className="font-display text-white text-lg tracking-wider">
                {m.nombre.toUpperCase()}
              </div>
              <div className="text-white/50 text-xs mt-1 font-semibold">
                {m.descripcion}
              </div>
            </div>

            {/* Flecha */}
            {!m.disabled && (
              <div className="text-naranja text-xl font-bold">→</div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <p className="text-white/20 text-xs mt-12 text-center">
        CADINC SRL · {new Date().getFullYear()}
      </p>

    </div>
  )
}