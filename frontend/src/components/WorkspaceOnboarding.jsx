

import { useState } from 'react'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import './WorkspaceOnboarding.css'

function FlaskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 3h6M10 3v6.5L4.8 18a1.8 1.8 0 001.55 2.7h11.3A1.8 1.8 0 0019.2 18L14 9.5V3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 15h9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function WorkspaceOnboarding() {
  const { createWorkspace } = useWorkspace()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (name.trim() === '' || creating) return
    setCreating(true)
    setError(null)
    try {
      await createWorkspace(name.trim(), null)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <div className="ws-onboarding">
      <div className="ws-onboarding__card">
        <div className="ws-onboarding__icon"><FlaskIcon /></div>
        <span className="ws-onboarding__eyebrow">Welcome</span>
        <h1 className="ws-onboarding__heading">Create your first workspace</h1>
        <p className="ws-onboarding__subtext">
          Workspaces organize your sensor datasets and make it easy to collaborate with other researchers.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="ws-onboarding__label" htmlFor="onboarding-workspace-name">Workspace name</label>
          <input
            id="onboarding-workspace-name"
            className="ws-onboarding__input"
            type="text"
            placeholder="e.g. FAST Lab Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
          {error && <p className="ws-onboarding__error">{error}</p>}
          <button type="submit" className="ws-onboarding__submit" disabled={name.trim() === '' || creating}>
            {creating ? 'Creating...' : 'Create workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
