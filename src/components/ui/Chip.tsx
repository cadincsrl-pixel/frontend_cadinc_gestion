type ChipVariant = 'default' | 'green' | 'orange' | 'purple' | 'yellow'

interface ChipProps {
  value: string | number
  label: string
  variant?: ChipVariant
}

const variants: Record<ChipVariant, string> = {
  default: 'bg-gris text-carbon',
  green:   'bg-verde-light text-verde',
  orange:  'bg-naranja-light text-naranja-dark',
  purple:  'bg-[#EEE8FF] text-[#5A2D82]',
  yellow:  'bg-amarillo-light text-[#7A5000]',
}

export function Chip({ value, label, variant = 'default' }: ChipProps) {
  return (
    <div className={`rounded-[9px] px-3 py-1.5 text-center min-w-[70px] ${variants[variant]}`}>
      <div className="font-mono text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70 mt-0.5">{label}</div>
    </div>
  )
}