

import { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import CreateWorkspaceDialog from './CreateWorkspaceDialog.jsx'
import './WorkspaceSwitcher.css'

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function initials(name) {
  return (name ?? '').trim().slice(0, 1).toUpperCase() || 'W'
}

export default function WorkspaceSwitcher({ collapsed, onNavigateWorkspaceSettings }) {
  const { workspaces, activeWorkspace, switching, switchWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  if (!activeWorkspace) return null

  return (
    <div className="ws-switcher" ref={rootRef}>
      <button
        type="button"
        className="ws-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={activeWorkspace.name}
      >
        <span className="ws-switcher__icon">{initials(activeWorkspace.name)}</span>
        {!collapsed && (
          <>
            <span className="ws-switcher__name">{switching ? 'Switching...' : activeWorkspace.name}</span>
            <span className="ws-switcher__chevron"><ChevronDown /></span>
          </>
        )}
      </button>

      {open && !collapsed && (
        <div className="ws-switcher__menu" role="listbox">
          <div className="ws-switcher__menu-list">
            {workspaces.map((w) => (
              <button
                key={w.workspace_id}
                type="button"
                role="option"
                aria-selected={w.workspace_id === activeWorkspace.workspace_id}
                className="ws-switcher__item"
                onClick={() => {
                  setOpen(false)
                  if (w.workspace_id !== activeWorkspace.workspace_id) switchWorkspace(w.workspace_id)
                }}
              >
                <span className="ws-switcher__item-icon">{initials(w.name)}</span>
                <span className="ws-switcher__item-name">{w.name}</span>
                {w.workspace_id === activeWorkspace.workspace_id && (
                  <span className="ws-switcher__item-check"><CheckIcon /></span>
                )}
              </button>
            ))}
          </div>

          <div className="ws-switcher__divider" />

          <button
            type="button"
            className="ws-switcher__action"
            onClick={() => { setOpen(false); setCreateOpen(true) }}
          >
            <PlusIcon /> Create workspace
          </button>

          {activeWorkspace.role === 'owner' && (
            <button
              type="button"
              className="ws-switcher__action"
              onClick={() => { setOpen(false); onNavigateWorkspaceSettings() }}
            >
              Workspace settings
            </button>
          )}
        </div>
      )}

      <CreateWorkspaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
