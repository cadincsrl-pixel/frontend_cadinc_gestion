'use client'

import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }: ModalProps) {
  // Cerrar con Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Bloquear scroll del body
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-azul/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-[18px] shadow-card-lg w-full ${width} max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-[slideUp_0.2s_ease]`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 sm:p-6 sm:pb-4">
          <h3 className="font-display text-lg sm:text-2xl text-azul tracking-wider truncate min-w-0">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 text-gris-mid hover:text-carbon transition-colors text-xl font-bold w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gris"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-4 sm:px-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex gap-2 justify-end flex-wrap px-4 pb-4 pt-2 sm:px-6 sm:pb-6 border-t border-gris">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}