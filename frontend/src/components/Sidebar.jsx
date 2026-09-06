

import { useState } from 'react'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx'
import ShareWorkspaceDialog from './ShareWorkspaceDialog.jsx'
import './Sidebar.css'

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDownSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4" strokeLinecap="round" />
    </svg>
  )
}

function MembersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 4.6a3.2 3.2 0 010 6.2M20 19c0-2.5-1.8-4.5-4.2-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getInitials(email) {
  const namePart = (email ?? '').split('@')[0]
  return namePart.slice(0, 2).toUpperCase() || '?'
}

function displayNameFromEmail(email) {
  const namePart = (email ?? '').split('@')[0] ?? ''
  return namePart.replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || email
}

export default function Sidebar({
  mode,
  onNavigateHome,
  onNavigateHistory,
  onNavigateSettings,
  onNavigateWorkspaceSettings,
  onUploadNew,
  email,
  onSignOut,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const { activeWorkspace, canUpload, isOwner } = useWorkspace()

  const workspaceSettingsActive = mode === 'workspace-settings'

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar__collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronIcon collapsed={collapsed} />
      </button>

      <div className="sidebar__brand">{collapsed ? 'I' : 'InsightLab'}</div>

      {activeWorkspace && (
        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-label">Active workspace</span>}
          <div className="sidebar__workspace-row">
            <WorkspaceSwitcher collapsed={collapsed} onNavigateWorkspaceSettings={onNavigateWorkspaceSettings} />
            {isOwner && (
              <button
                className="sidebar__row sidebar__row--pill"
                onClick={() => setShareOpen(true)}
                title="Share workspace"
              >
                <ShareIcon />
                {!collapsed && 'Share'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sidebar__section">
        <button
          className={`sidebar__row${mode === 'analysis' || mode === 'upload' ? ' active' : ''}`}
          onClick={onNavigateHome}
          title="Home"
        >
          <HomeIcon />
          {!collapsed && 'Home'}
        </button>
        <button
          className={`sidebar__row${mode === 'history' ? ' active' : ''}`}
          onClick={onNavigateHistory}
          title="History"
        >
          <HistoryIcon />
          {!collapsed && 'History'}
        </button>
        <button
          className={`sidebar__row${mode === 'settings' ? ' active' : ''}`}
          onClick={onNavigateSettings}
          title="Settings"
        >
          <SettingsIcon />
          {!collapsed && 'Settings'}
        </button>
      </div>

      {canUpload && (
        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-label">Data</span>}
          <button className="sidebar__row" onClick={onUploadNew} title="Upload files">
            <UploadIcon />
            {!collapsed && 'Upload files'}
          </button>
        </div>
      )}

      {isOwner && (
        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-label">Collaboration</span>}
          <button
            className={`sidebar__row${workspaceSettingsActive ? ' active' : ''}`}
            onClick={onNavigateWorkspaceSettings}
            title="Members"
          >
            <MembersIcon />
            {!collapsed && 'Members'}
          </button>
          <button className="sidebar__row" onClick={() => setShareOpen(true)} title="Share workspace">
            <ShareIcon />
            {!collapsed && 'Share workspace'}
          </button>
        </div>
      )}

      {isOwner && (
        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-label">Workspace</span>}
          <button
            className={`sidebar__row${workspaceSettingsActive ? ' active' : ''}`}
            onClick={onNavigateWorkspaceSettings}
            title="Workspace settings"
          >
            <SettingsIcon />
            {!collapsed && 'Workspace settings'}
          </button>
        </div>
      )}

      <div className="sidebar__spacer" />

      <div className="sidebar__footer">
        <div className="sidebar__profile" title={email}>
          <span className="sidebar__avatar">{getInitials(email)}</span>
          {!collapsed && (
            <>
              <div className="sidebar__profile-text">
                <span className="sidebar__name">{displayNameFromEmail(email)}</span>
                <span className="sidebar__email">{email}</span>
              </div>
              <span className="sidebar__profile-chevron"><ChevronDownSmall /></span>
            </>
          )}
        </div>
        <button className="sidebar__row sidebar__signout" onClick={onSignOut} title="Sign out">
          <LogoutIcon />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      <ShareWorkspaceDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </nav>
  )
}
