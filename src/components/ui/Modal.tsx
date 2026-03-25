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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-azul/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-[18px] shadow-card-lg w-full ${width} max-h-[90vh] overflow-y-auto animate-[slideUp_0.2s_ease]`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h3 className="font-display text-2xl text-azul tracking-wider">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gris-mid hover:text-carbon transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gris"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex gap-2 justify-end px-6 pb-6 pt-2 border-t border-gris">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}