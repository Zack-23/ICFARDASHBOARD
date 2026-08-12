// Home -- the post-login app shell. A persistent Sidebar on the left
// (Home/History nav, Upload action, Sign out) and a full-height main
// content area on the right that swaps between three modes: 'upload'
// (no group active yet, or the user chose to upload more), 'workspace'
// (the real viewer: time window + graphs + stats + table), and
// 'history' (search/view saved groups -- an index only, View just loads
// a group and hands off back to workspace mode).
// Place this at src/Home.jsx.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './hooks/UseAuth.jsx'
import Sidebar from './components/Sidebar'
import FileUpload from './components/Fileupload'
import History from './components/History'
import Settings, { DEFAULT_HOURS_KEY } from './components/Settings'
import TimeWindowSelect from './components/TimeWindowSelect'
import IndividualGraph from './components/IndividualGraph'
import Overlaygraph from './components/Overlaygraph'
import Statspanel from './components/Statspanel'
import TableView from './components/TableView'
import './Home.css'

function getDefaultHours() {
  const stored = localStorage.getItem(DEFAULT_HOURS_KEY)
  const parsed = Number(stored)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24
}

export default function Home() {
  const { session, signOut, apiFetch } = useAuth()

  const [loadingActive, setLoadingActive] = useState(true)
  const [activeGroup, setActiveGroup] = useState(null)
  const [rows, setRows] = useState([])
  const [hours, setHours] = useState(getDefaultHours)
  const [statsColumns, setStatsColumns] = useState([])
  const [overlayColumns, setOverlayColumns] = useState([])
  const [mode, setMode] = useState('workspace') // 'upload' | 'workspace' | 'history' | 'settings'
  const [error, setError] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [renameError, setRenameError] = useState(null)

  const loadReadings = useCallback(async (groupId, windowHours) => {
    const res = await apiFetch(`/groups/${groupId}/readings?hours=${windowHours}`)
    if (!res.ok) throw new Error('Failed to load readings')
    const data = await res.json()
    setActiveGroup(data.group)
    setRows(data.rows)
  }, [apiFetch])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res = await apiFetch('/groups/active')
        if (!res.ok) throw new Error('Failed to check active group')
        const data = await res.json()
        if (cancelled) return

        if (data.group) {
          await loadReadings(data.group.group_id, hours)
          setMode('workspace')
        } else {
          setMode('upload')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingActive(false)
      }
    }

    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleHoursChange = async (newHours) => {
    setHours(newHours)
    if (activeGroup) {
      await loadReadings(activeGroup.group_id, newHours)
    }
  }

  const handleUploadDone = async () => {
    setLoadingActive(true)
    try {
      const res = await apiFetch('/groups/active')
      const data = await res.json()
      if (data.group) {
        await loadReadings(data.group.group_id, hours)
      }
      setMode('workspace')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingActive(false)
    }
  }

  const handleViewFromHistory = async (groupId) => {
    setLoadingActive(true)
    try {
      await loadReadings(groupId, hours)
      setMode('workspace')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingActive(false)
    }
  }

  const startRename = () => {
    setNameInput(activeGroup.name)
    setRenameError(null)
    setEditingName(true)
  }

  const submitRename = async () => {
    const trimmed = nameInput.trim()
    if (trimmed === '' || trimmed === activeGroup.name) {
      setEditingName(false)
      return
    }
    try {
      const res = await apiFetch(`/groups/${activeGroup.group_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Rename failed')
      }
      setActiveGroup((prev) => ({ ...prev, name: trimmed }))
      setEditingName(false)
    } catch (err) {
      setRenameError(err.message)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        onNavigateHome={() => setMode(activeGroup ? 'workspace' : 'upload')}
        onNavigateHistory={() => setMode('history')}
        onNavigateSettings={() => setMode('settings')}
        onUploadNew={() => setMode('upload')}
        email={session.user.email}
        onSignOut={signOut}
      />

      <main className="main-content">
        <div key={mode} className="main-content__page">
          {loadingActive && <p className="home__loading">Loading...</p>}

          {!loadingActive && error && <p className="file-upload__error">{error}</p>}

          {!loadingActive && mode === 'upload' && (
            <FileUpload onComplete={handleUploadDone} />
          )}

          {!loadingActive && mode === 'history' && (
            <History
              onView={handleViewFromHistory}
              onBack={() => setMode('workspace')}
            />
          )}

          {!loadingActive && mode === 'settings' && (
            <Settings onBack={() => setMode('workspace')} />
          )}

          {!loadingActive && mode === 'workspace' && activeGroup && (
            <div className="home__workspace">
              <div className="home__workspace-header">
                <div>
                  <span className="home__workspace-eyebrow">Active group</span>
                  {editingName ? (
                    <div className="home__rename">
                      <input
                        className="home__rename-input"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitRename()
                          if (e.key === 'Escape') setEditingName(false)
                        }}
                        autoFocus
                      />
                      <button className="home__rename-save" onClick={submitRename}>Save</button>
                      <button className="home__rename-cancel" onClick={() => setEditingName(false)}>Cancel</button>
                    </div>
                  ) : (
                    <h1 className="home__workspace-title" onClick={startRename} title="Click to rename">
                      {activeGroup.name}
                      <svg className="home__rename-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </h1>
                  )}
                  {renameError && <p className="home__rename-error">{renameError}</p>}
                </div>
                <TimeWindowSelect hours={hours} onChange={handleHoursChange} />
              </div>

              <IndividualGraph rows={rows} onFamilyChange={setStatsColumns} />
              <Statspanel rows={rows} columns={statsColumns} hours={hours} />
              <Overlaygraph rows={rows} onFamiliesChange={setOverlayColumns} />
              <Statspanel rows={rows} columns={overlayColumns} hours={hours} />
              <TableView rows={rows} />
            </div>
          )}

          {!loadingActive && mode === 'workspace' && !activeGroup && (
            <p className="home__loading">No group selected yet.</p>
          )}
        </div>
      </main>
    </div>
  )
}