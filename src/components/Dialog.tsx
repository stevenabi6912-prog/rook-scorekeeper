import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Dialog({
  open, title, children, confirmLabel = 'OK', cancelLabel = 'Cancel', danger, confirmDisabled, onConfirm, onCancel,
}: DialogProps) {
  if (!open) return null
  return (
    <div className="dialog-backdrop" onClick={onCancel} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="actions">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
