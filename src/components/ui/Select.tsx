import { type SelectHTMLAttributes, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string | number; label: string }>
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`
            w-full px-3 py-2 border-[1.5px] rounded-lg
            font-sans text-sm text-carbon bg-blanco
            outline-none transition-colors cursor-pointer
            focus:border-naranja
            disabled:opacity-60 disabled:cursor-not-allowed
            ${error ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="">— {placeholder} —</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <span className="text-xs text-rojo font-semibold">{error}</span>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'