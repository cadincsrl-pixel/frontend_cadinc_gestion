import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          // Default: sin autofill del navegador (es un ERP, los campos son datos
          // de negocio, no credenciales). Overridable: si un input necesita
          // autocompletar, pasale `autoComplete="..."` y pisa este default.
          autoComplete="off"
          // Cortamos a los gestores de contraseñas (1Password/LastPass), que
          // igual ignoran autoComplete=off y ofrecen rellenar campos como
          // Alias/CBU "como si fueran usuario/contraseña". El login usa <input>
          // crudos, así que no se ve afectado por este default.
          data-1p-ignore
          data-lpignore="true"
          className={`
            w-full px-3 py-2 border-[1.5px] rounded-lg
            font-sans text-sm text-carbon bg-blanco
            outline-none transition-colors
            placeholder:text-gris-mid
            focus:border-naranja focus:bg-white
            disabled:opacity-60 disabled:cursor-not-allowed
            ${error ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-xs text-rojo font-semibold">{error}</span>
        )}
        {hint && !error && (
          <span className="text-xs text-gris-dark">{hint}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'