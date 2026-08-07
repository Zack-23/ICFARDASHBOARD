// Left sidebar -- the persistent navigation shell for the whole app.
// Wordmark, a prominent "Upload files" action, Home/History nav, the
// user's email + Sign out pinned at the bottom, and a collapse toggle
// that shrinks it down to an icon-only rail so the workspace can use
// the reclaimed width.
// Place this at src/components/Sidebar.jsx. Needs its sibling Sidebar.css.

import { useState } from 'react'
import './Sidebar.css'

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11.5L12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15V5M12 5l-3.5 3.5M12 5l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getInitials(email) {
  const namePart = (email ?? '').split('@')[0]
  return namePart.slice(0, 2).toUpperCase() || '?'
}

export default function Sidebar({ mode, onNavigateHome, onNavigateHistory, onNavigateSettings, onUploadNew, email, onSignOut }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar__collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronIcon collapsed={collapsed} />
      </button>

      <div className="sidebar__brand">{collapsed ? 'I' : 'ICFAR'}</div>

      <button className="sidebar__upload" onClick={onUploadNew} title="Upload files">
        <UploadIcon />
        {!collapsed && 'Upload files'}
      </button>

      <div className="sidebar__nav">
        <button
          className={mode === 'workspace' || mode === 'upload' ? 'active' : ''}
          onClick={onNavigateHome}
          title="Home"
        >
          <HomeIcon />
          {!collapsed && 'Home'}
        </button>
        <button
          className={mode === 'history' ? 'active' : ''}
          onClick={onNavigateHistory}
          title="History"
        >
          <HistoryIcon />
          {!collapsed && 'History'}
        </button>
        <button
          className={mode === 'settings' ? 'active' : ''}
          onClick={onNavigateSettings}
          title="Settings"
        >
          <SettingsIcon />
          {!collapsed && 'Settings'}
        </button>
      </div>

      <div className="sidebar__spacer" />

      <div className="sidebar__footer">
        <div className="sidebar__profile" title={email}>
          <span className="sidebar__avatar">{getInitials(email)}</span>
          {!collapsed && <span className="sidebar__email">{email}</span>}
        </div>
        <button className="sidebar__signout" onClick={onSignOut}>
          {!collapsed ? 'Sign out' : '\u2192'}
        </button>
      </div>
    </nav>
  )
}