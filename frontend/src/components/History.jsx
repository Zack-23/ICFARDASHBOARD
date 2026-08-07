// History -- a list of saved groups with a search bar. Each row has
// View (loads the group as active and returns to the workspace) and
// Delete (removes the whole group, with an inline confirm). Clicking
// the group itself (like opening a folder) navigates into a dedicated
// files view for that group, where individual files can be added or
// deleted -- file management lives one level down, not inline in the
// list.
// Place this at src/components/History.jsx. Needs its sibling History.css.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import './History.css'

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HistoryRow({ group, onView, onOpen, onDeleted }) {
  const { apiFetch } = useAuth()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const handleDeleteGroup = async () => {
    setDeleting(true)
    try {
      const res = await apiFetch(`/groups/${group.group_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted(group.group_id)
    } catch (err) {
      setDeleting(false)
      setError(err.message)
    }
  }

  return (
    <div className="history__row-wrapper">
      <div className="history__row">
        <div className="history__row-info" onClick={onOpen}>
          <span className="history__row-name">
            <span className="history__row-folder-icon"><FolderIcon /></span>
            {group.name}
          </span>
          <span className="history__row-meta">
            {group.headers.length} columns &middot; saved {new Date(group.created_at).toLocaleDateString()}
          </span>
          {error && <span className="history__row-status error">{error}</span>}
        </div>

        <div className="history__row-actions">
          <button className="history__view" onClick={() => onView(group.group_id)}>
            View
          </button>

          {confirmingDelete ? (
            <>
              <button className="history__delete-confirm" onClick={handleDeleteGroup} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button className="history__delete-cancel" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="history__delete" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupFiles({ group, onBack, onGroupDeleted }) {
  const { apiFetch } = useAuth()
  const fileInputRef = useRef(null)

  const [files, setFiles] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingFile, setDeletingFile] = useState(null)
  const [addStatus, setAddStatus] = useState('idle') // idle | uploading | saving | done | error
  const [addError, setAddError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`/groups/${group.group_id}/files`)
        if (!res.ok) throw new Error('Failed to load files')
        const data = await res.json()
        if (!cancelled) setFiles(data.files)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.group_id])

  const handleDeleteFile = async (filename) => {
    setDeletingFile(filename)
    setError(null)
    try {
      const res = await apiFetch(
        `/groups/${group.group_id}/files/${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to delete file')
      const data = await res.json()

      if (data.group_deleted) {
        onGroupDeleted()
        return
      }
      setFiles(data.files)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingFile(null)
    }
  }

  const handleAddFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return
    setAddStatus('uploading')
    setAddError(null)

    try {
      const formData = new FormData()
      for (const file of fileList) formData.append('files', file)

      const uploadRes = await apiFetch('/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const uploadData = await uploadRes.json()

      const detected = uploadData.group[0]
      if (!detected) throw new Error('No recognizable header in those files')

      setAddStatus('saving')
      const saveRes = await apiFetch('/groups/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: uploadData.session_id,
          groups: [{
            name: group.name,
            headers: detected.headers,
            raw_header: detected.raw_header,
            filenames: detected.files,
          }],
        }),
      })
      if (!saveRes.ok) {
        const body = await saveRes.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Save failed -- structure may not match this group')
      }

      setAddStatus('done')
      const filesRes = await apiFetch(`/groups/${group.group_id}/files`)
      const filesData = await filesRes.json()
      setFiles(filesData.files)
    } catch (err) {
      setAddStatus('error')
      setAddError(err.message)
    }
  }

  return (
    <div className="history">
      <div className="history__header">
        <div className="history__breadcrumb">
          <button className="history__breadcrumb-link" onClick={onBack}>History</button>
          <span className="history__breadcrumb-sep">/</span>
          <span className="history__breadcrumb-current">{group.name}</span>
        </div>
        <button className="history__back" onClick={onBack}>Back to groups</button>
      </div>

      <div className="history__folder-actions">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleAddFiles(e.target.files)}
        />
        <button
          className="history__add"
          onClick={() => fileInputRef.current?.click()}
          disabled={addStatus === 'uploading' || addStatus === 'saving'}
        >
          Add files
        </button>
        {addStatus === 'uploading' && <span className="history__row-status">Uploading...</span>}
        {addStatus === 'saving' && <span className="history__row-status">Saving...</span>}
        {addStatus === 'done' && <span className="history__row-status done">Files added</span>}
        {addStatus === 'error' && <span className="history__row-status error">{addError}</span>}
      </div>

      {loading && <p className="history__loading">Loading files...</p>}
      {error && <p className="file-upload__error">{error}</p>}

      {!loading && files && (
        <div className="history__files history__files--standalone">
          {files.length === 0 && <p className="history__files-empty">No files in this group.</p>}
          {files.map((filename) => (
            <div className="history__file-row" key={filename}>
              <span className="history__file-name">{filename}</span>
              <button
                className="history__file-delete"
                onClick={() => handleDeleteFile(filename)}
                disabled={deletingFile === filename}
              >
                {deletingFile === filename ? 'Removing...' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 8

export default function History({ onView, onBack }) {
  const { apiFetch } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [openGroup, setOpenGroup] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await apiFetch('/groups')
        if (!res.ok) throw new Error('Failed to load groups')
        const data = await res.json()
        if (!cancelled) setGroups(data.groups)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const handleDeleted = (groupId) => {
    setGroups((prev) => prev.filter((g) => g.group_id !== groupId))
    setOpenGroup((prev) => (prev?.group_id === groupId ? null : prev))
  }

  if (openGroup) {
    return (
      <GroupFiles
        group={openGroup}
        onBack={() => setOpenGroup(null)}
        onGroupDeleted={() => handleDeleted(openGroup.group_id)}
      />
    )
  }

  return (
    <div className="history">
      <div className="history__header">
        <h1>History</h1>
        <button className="history__back" onClick={onBack}>Back to dashboard</button>
      </div>

      <input
        className="history__search"
        type="text"
        placeholder="Search groups by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="history__loading">Loading...</p>}
      {error && <p className="file-upload__error">{error}</p>}

      {!loading && !error && (
        <div className="history__list">
          {filtered.length === 0 && (
            <p className="history__empty">No groups match your search.</p>
          )}
          {pageItems.map((group) => (
            <HistoryRow
              key={group.group_id}
              group={group}
              onView={onView}
              onOpen={() => setOpenGroup(group)}
              onDeleted={handleDeleted}
            />
          ))}

          {filtered.length > PAGE_SIZE && (
            <div className="history__pagination">
              <span className="history__pagination-info">
                {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="history__pagination-controls">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span className="history__pagination-page">{page} / {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}