// Settings -- deliberately minimal for now: account info plus a default
// time-window preference, persisted to localStorage (no backend change
// needed, matches the "keep it small" scope we agreed on). More can be
// added here later as it's actually needed, not preemptively.
// Place this at src/components/Settings.jsx. Needs its sibling
// Settings.css, and reuses Dashboard.css's .dashboard-select styling.

import { useState } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import './Dashboard.css'
import './Settings.css'

export const DEFAULT_HOURS_KEY = 'icfar_default_hours'

const WINDOW_OPTIONS = [
  { label: '24 hours', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
  { label: '14 days', value: 336 },
]

export default function Settings({ onBack }) {
  const { session } = useAuth()
  const [defaultHours, setDefaultHours] = useState(() => {
    const stored = localStorage.getItem(DEFAULT_HOURS_KEY)
    const parsed = Number(stored)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24
  })
  const [saved, setSaved] = useState(false)

  const handleChange = (value) => {
    setDefaultHours(value)
    localStorage.setItem(DEFAULT_HOURS_KEY, String(value))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h1>Settings</h1>
        <button className="settings__back" onClick={onBack}>Back to dashboard</button>
      </div>

      <div className="settings__section">
        <span className="settings__label">Account</span>
        <p className="settings__value">{session.user.email}</p>
      </div>

      <div className="settings__section">
        <span className="settings__label">Default time window</span>
        <p className="settings__hint">
          Used when a group first loads, until you change it for that session.
        </p>
        <select
          className="dashboard-select"
          value={defaultHours}
          onChange={(e) => handleChange(Number(e.target.value))}
        >
          {WINDOW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {saved && <span className="settings__saved">Saved</span>}
      </div>
    </div>
  )
}