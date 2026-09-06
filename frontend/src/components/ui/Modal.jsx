// Shared accessible modal shell -- backdrop, Escape-to-close, focus
// trapped inside while open, focus restored to whatever triggered it on
// close. Every Workspace dialog (Create, Share, destructive confirms)
// renders its own content as children; this only owns the chrome and
// the keyboard/focus behavior so that doesn't get reimplemented per
// dialog.
// Place at src/components/ui/Modal.jsx. Needs its sibling Modal.css.

import { useEffect, useId, useRef } from 'react'
import './Modal.css'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, description, width = 440, children, labelledBy, closeOnBackdrop = true }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement

    const node = dialogRef.current
    const focusable = node?.querySelectorAll(FOCUSABLE)
    ;(focusable?.[0] ?? node)?.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(node?.querySelectorAll(FOCUSABLE) ?? [])
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className="modal__dialog"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        {title && (
          <div className="modal__header">
            <h2 className="modal__title" id={titleId}>{title}</h2>
            {description && <p className="modal__description">{description}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
