

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './UseAuth.jsx'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const { session, apiFetch } = useAuth()

  const [workspaceList, setWorkspaceList] = useState([])
  const [activeWorkspace, setActiveWorkspace] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'onboarding' | 'error'
  const [error, setError] = useState(null)
  const [switching, setSwitching] = useState(false)

  const refreshWorkspaces = useCallback(async () => {
    const res = await apiFetch('/workspaces')
    if (!res.ok) throw new Error('Failed to load workspaces')
    const data = await res.json()
    setWorkspaceList(data.workspaces)
    return data.workspaces
  }, [apiFetch])

  useEffect(() => {
    if (!session) {
      setStatus('loading')
      setActiveWorkspace(null)
      setWorkspaceList([])
      return
    }

    let cancelled = false

    async function init() {
      setStatus('loading')
      setError(null)
      try {
        const [, activeData] = await Promise.all([
          refreshWorkspaces(),
          apiFetch('/workspaces/active').then((r) => r.json()),
        ])
        if (cancelled) return

        setActiveWorkspace(activeData.workspace)
        setStatus(activeData.workspace ? 'ready' : 'onboarding')
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setStatus('error')
        }
      }
    }

    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const createWorkspace = useCallback(async (name, description) => {
    const res = await apiFetch('/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? 'Failed to create workspace')
    }
    const data = await res.json()
    await refreshWorkspaces()
    // Clear activeWorkspace for one tick first so any component keyed
    // off workspace_id (Home's data effects) never renders the new
    // workspace's chrome with the old workspace's still-loaded data.
    setActiveWorkspace(null)
    setStatus('ready')
    setActiveWorkspace(data.workspace)
    return data.workspace
  }, [apiFetch, refreshWorkspaces])

  const switchWorkspace = useCallback(async (workspaceId) => {
    if (!workspaceId || activeWorkspace?.workspace_id === workspaceId) return
    setSwitching(true)
    setActiveWorkspace(null) // avoid ever rendering workspace B's chrome next to workspace A's data
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/activate`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to switch workspace')
      const data = await res.json()
      setActiveWorkspace(data.workspace)
    } finally {
      setSwitching(false)
    }
  }, [apiFetch, activeWorkspace])

  const updateWorkspace = useCallback(async (workspaceId, updates) => {
    const res = await apiFetch(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? 'Failed to update workspace')
    }
    const data = await res.json()
    setWorkspaceList((prev) => prev.map((w) => (w.workspace_id === workspaceId ? data.workspace : w)))
    setActiveWorkspace((prev) => (prev?.workspace_id === workspaceId ? data.workspace : prev))
    return data.workspace
  }, [apiFetch])

  const deleteWorkspace = useCallback(async (workspaceId) => {
    const res = await apiFetch(`/workspaces/${workspaceId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? 'Failed to delete workspace')
    }

    const wasActive = activeWorkspace?.workspace_id === workspaceId
    await refreshWorkspaces()

    if (wasActive) {
      setActiveWorkspace(null)
      const activeData = await apiFetch('/workspaces/active').then((r) => r.json())
      setActiveWorkspace(activeData.workspace)
      setStatus(activeData.workspace ? 'ready' : 'onboarding')
    }
  }, [apiFetch, refreshWorkspaces, activeWorkspace])

  const isOwner = activeWorkspace?.role === 'owner'
  const canUpload = isOwner || !!activeWorkspace?.can_upload
  const canModifyDatasets = isOwner || !!activeWorkspace?.can_modify_datasets

  const value = {
    workspaces: workspaceList,
    activeWorkspace,
    status,
    error,
    switching,
    isOwner,
    canUpload,
    canModifyDatasets,
    refreshWorkspaces,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    deleteWorkspace,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used inside a <WorkspaceProvider>')
  }
  return context
}
