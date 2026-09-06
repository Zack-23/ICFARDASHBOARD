// Subtle, non-blocking feedback -- replaces browser alert()/confirm()
// for things like "Link copied" or "Permissions updated". Mount
// <ToastProvider> once near the root; call useToast() anywhere below it.
// Place at src/components/ui/Toast.jsx. Needs its sibling Toast.css.

import { createContext, useContext, useCallback, useRef, useState } from 'react'
import './Toast.css'

const ToastContext = createContext(null)

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message, { tone = 'default', duration = 2500 } = {}) => {
    const id = ++idCounter
    setToasts((prev) => [...prev, { id, message, tone }])
    const timer = setTimeout(() => dismiss(id), duration)
    timers.current.set(id, timer)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>')
  }
  return context.showToast
}
