type BadgeVariant = 'pendiente' | 'cerrado' | 'activo' | 'inactivo'

interface BadgeProps {
  variant: BadgeVariant
  label?: string
}

const styles: Record<BadgeVariant, string> = {
  pendiente: 'bg-amarillo-light text-[#7A5000]',
  cerrado:   'bg-verde-light text-verde',
  activo:    'bg-azul-light text-azul',
  inactivo:  'bg-gris text-gris-dark',
}

const defaultLabels: Record<BadgeVariant, string> = {
  pendiente: 'Pendiente',
  cerrado:   'Cerrado',
  activo:    'Activo',
  inactivo:  'Inactivo',
}

export function Badge({ variant, label }: BadgeProps) {
  return (
    <span className={`
      inline-block text-[11px] font-bold px-2 py-0.5
      rounded-full uppercase tracking-wider
      ${styles[variant]}
    `}>
      {label ?? defaultLabels[variant]}
    </span>
  )
}