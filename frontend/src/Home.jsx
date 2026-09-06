
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './hooks/UseAuth.jsx'
import { useWorkspace } from './hooks/UseWorkspace.jsx'
import Sidebar from './components/Sidebar'
import FileUpload from './components/Fileupload'
import History from './components/History'
import Settings, { DEFAULT_HOURS_KEY } from './components/Settings'
import WorkspaceOnboarding from './components/WorkspaceOnboarding'
import WorkspaceSettings from './components/WorkspaceSettings'
import ShareWorkspaceDialog from './components/ShareWorkspaceDialog'
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

function UploadCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 18a4.5 4.5 0 01-.6-8.96A5.5 5.5 0 0117 8.5a4 4 0 01-.5 7.98" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12v6M9.5 15.5L12 13l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Home() {
  const { session, signOut, apiFetch } = useAuth()
  const { activeWorkspace, status: workspaceStatus, canUpload, canModifyDatasets } = useWorkspace()

  const [loadingActive, setLoadingActive] = useState(true)
  const [activeGroup, setActiveGroup] = useState(null)
  const [rows, setRows] = useState([])
  const [hours, setHours] = useState(getDefaultHours)
  const [statsColumns, setStatsColumns] = useState([])
  const [overlayColumns, setOverlayColumns] = useState([])
  const [mode, setMode] = useState('analysis') // 'upload' | 'analysis' | 'history' | 'settings' | 'workspace-settings'
  const [error, setError] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [renameError, setRenameError] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)

  const workspaceId = activeWorkspace?.workspace_id

  const loadReadings = useCallback(async (groupId, windowHours) => {
    const res = await apiFetch(`/groups/${groupId}/readings?hours=${windowHours}`)
    if (!res.ok) throw new Error('Failed to load readings')
    const data = await res.json()
    setActiveGroup(data.group)
    setRows(data.rows)
  }, [apiFetch])

  // Re-runs on every workspace switch, not just on mount. Clears
  // whatever the previous workspace had loaded FIRST, before fetching
  // anything for the new one -- otherwise a slow request for workspace
  // B could still be in flight while workspace A's graphs are visibly
  // sitting on screen, which is exactly the stale-data leak the
  // workspace switch has to avoid.
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    async function init() {
      setLoadingActive(true)
      setActiveGroup(null)
      setRows([])
      setError(null)
      setMode('analysis')

      try {
        const res = await apiFetch(`/groups/active?workspace_id=${workspaceId}`)
        if (!res.ok) throw new Error('Failed to check active group')
        const data = await res.json()
        if (cancelled) return

        if (data.group) {
          await loadReadings(data.group.group_id, hours)
          setMode('analysis')
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
  }, [workspaceId])

  const handleHoursChange = async (newHours) => {
    setHours(newHours)
    if (activeGroup) {
      await loadReadings(activeGroup.group_id, newHours)
    }
  }

  const handleUploadDone = async () => {
    setLoadingActive(true)
    try {
      const res = await apiFetch(`/groups/active?workspace_id=${workspaceId}`)
      const data = await res.json()
      if (data.group) {
        await loadReadings(data.group.group_id, hours)
      }
      setMode('analysis')
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
      setMode('analysis')
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

  if (workspaceStatus === 'loading') {
    return <p className="home__loading">Loading your workspaces...</p>
  }

  if (workspaceStatus === 'onboarding') {
    return <WorkspaceOnboarding />
  }

  if (workspaceStatus === 'error') {
    return <p className="file-upload__error">Couldn't load your workspaces. Try reloading the page.</p>
  }

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        onNavigateHome={() => setMode(activeGroup ? 'analysis' : 'upload')}
        onNavigateHistory={() => setMode('history')}
        onNavigateSettings={() => setMode('settings')}
        onNavigateWorkspaceSettings={() => setMode('workspace-settings')}
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
              onBack={() => setMode('analysis')}
            />
          )}

          {!loadingActive && mode === 'settings' && (
            <Settings onBack={() => setMode('analysis')} />
          )}

          {!loadingActive && mode === 'workspace-settings' && (
            <WorkspaceSettings
              onBack={() => setMode('analysis')}
              onOpenShare={() => setShareOpen(true)}
              onWorkspaceDeleted={() => setMode('analysis')}
            />
          )}

          {!loadingActive && mode === 'analysis' && activeGroup && (
            <div className="home__analysis">
              <div className="home__analysis-header">
                <div>
                  <span className="home__analysis-eyebrow">Active dataset</span>
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
                    <h1
                      className={`home__analysis-title${canModifyDatasets ? '' : ' home__analysis-title--static'}`}
                      onClick={canModifyDatasets ? startRename : undefined}
                      title={canModifyDatasets ? 'Click to rename' : undefined}
                    >
                      {activeGroup.name}
                      {canModifyDatasets && (
                        <svg className="home__rename-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
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

          {!loadingActive && mode === 'analysis' && !activeGroup && (
            <div className="home__empty">
              <div className="home__empty-icon"><UploadCloudIcon /></div>
              <p className="home__empty-title">No datasets yet</p>
              <p className="home__empty-subtext">
                {canUpload
                  ? 'Upload sensor data to begin exploring this workspace.'
                  : "This workspace doesn't have any datasets yet. Ask an owner or contributor to upload some."}
              </p>
              {canUpload && (
                <button className="home__empty-action" onClick={() => setMode('upload')}>Upload data</button>
              )}
            </div>
          )}
        </div>
      </main>

      <ShareWorkspaceDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
