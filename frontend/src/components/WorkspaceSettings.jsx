

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import { useToast } from './ui/Toast.jsx'
import Modal from './ui/Modal.jsx'
import Toggle from './ui/Toggle.jsx'
import './ui/Modal.css'
import './WorkspaceSettings.css'

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function initials(text) {
  return (text ?? '?').trim().slice(0, 2).toUpperCase()
}

function MemberRow({ member, onUpdate, onRemove }) {
  const [canUpload, setCanUpload] = useState(member.can_upload)
  const [canModifyDatasets, setCanModifyDatasets] = useState(member.can_modify_datasets)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const persist = async (next) => {
    setSaving(true)
    try {
      await onUpdate(member.user_id, next)
    } finally {
      setSaving(false)
    }
  }

  const isOwner = member.role === 'owner'

  return (
    <div className="ws-settings__member">
      <div className="ws-settings__member-identity">
        <span className="ws-settings__member-avatar">{initials(member.email ?? member.user_id)}</span>
        <div className="ws-settings__member-text">
          <span className="ws-settings__member-email">{member.email ?? member.user_id}</span>
          <span className="ws-settings__member-meta">
            {isOwner ? 'Owner' : 'Member'} &middot; joined {new Date(member.joined_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {isOwner ? (
        <span className="ws-settings__owner-badge">Full access</span>
      ) : (
        <div className="ws-settings__member-toggles">
          <Toggle
            id={`upload-${member.user_id}`}
            label="Upload files"
            checked={canUpload}
            disabled={saving}
            onChange={(v) => { setCanUpload(v); persist({ can_upload: v, can_modify_datasets: canModifyDatasets }) }}
          />
          <Toggle
            id={`modify-${member.user_id}`}
            label="Modify existing datasets"
            checked={canModifyDatasets}
            disabled={saving}
            onChange={(v) => { setCanModifyDatasets(v); persist({ can_upload: canUpload, can_modify_datasets: v }) }}
          />
        </div>
      )}

      {!isOwner && (
        confirmingRemove ? (
          <div className="ws-settings__remove-confirm">
            <button
              className="ws-settings__remove-confirm-btn"
              disabled={removing}
              onClick={async () => { setRemoving(true); await onRemove(member.user_id); setRemoving(false) }}
            >
              {removing ? 'Removing...' : 'Confirm remove'}
            </button>
            <button className="ws-settings__remove-cancel-btn" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="ws-settings__remove-btn" onClick={() => setConfirmingRemove(true)}>
            Remove
          </button>
        )
      )}
    </div>
  )
}

function DeleteWorkspaceDialog({ open, onClose, workspace, onDeleted }) {
  const { deleteWorkspace } = useWorkspace()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const handleClose = () => {
    setConfirmText('')
    setError(null)
    onClose()
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await deleteWorkspace(workspace.workspace_id)
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  const matches = confirmText.trim() === workspace?.name

  return (
    <Modal open={open} onClose={handleClose} title="Delete workspace" width={420}>
      <p className="ws-settings__delete-warning">
        This permanently deletes <strong>{workspace?.name}</strong> -- every dataset, file, and member's
        access to it. This cannot be undone.
      </p>
      <div className="modal__field">
        <label className="modal__label" htmlFor="confirm-delete-name">
          Type <strong>{workspace?.name}</strong> to confirm
        </label>
        <input
          id="confirm-delete-name"
          className="modal__input"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="modal__error">{error}</p>}
      <div className="modal__footer">
        <button className="modal__btn modal__btn--secondary" onClick={handleClose}>Cancel</button>
        <button className="modal__btn modal__btn--danger" onClick={handleDelete} disabled={!matches || deleting}>
          {deleting ? 'Deleting...' : 'Delete workspace'}
        </button>
      </div>
    </Modal>
  )
}

export default function WorkspaceSettings({ onBack, onOpenShare, onWorkspaceDeleted }) {
  const { apiFetch } = useAuth()
  const { activeWorkspace, updateWorkspace } = useWorkspace()
  const showToast = useToast()

  const [name, setName] = useState(activeWorkspace?.name ?? '')
  const [description, setDescription] = useState(activeWorkspace?.description ?? '')
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [generalError, setGeneralError] = useState(null)

  const [members, setMembers] = useState(null)
  const [membersError, setMembersError] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const workspaceId = activeWorkspace?.workspace_id

  const loadMembers = useCallback(async () => {
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/members`)
      if (!res.ok) throw new Error('Failed to load members')
      const data = await res.json()
      setMembers(data.members)
    } catch (err) {
      setMembersError(err.message)
    }
  }, [apiFetch, workspaceId])

  useEffect(() => {
    setName(activeWorkspace?.name ?? '')
    setDescription(activeWorkspace?.description ?? '')
    if (workspaceId) loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const handleSaveGeneral = async (e) => {
    e.preventDefault()
    if (name.trim() === '') return
    setSavingGeneral(true)
    setGeneralError(null)
    try {
      await updateWorkspace(workspaceId, { name: name.trim(), description: description.trim() })
      showToast('Workspace updated', { tone: 'success' })
    } catch (err) {
      setGeneralError(err.message)
    } finally {
      setSavingGeneral(false)
    }
  }

  const handleUpdateMember = async (memberUserId, permissions) => {
    const res = await apiFetch(`/workspaces/${workspaceId}/members/${memberUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(permissions),
    })
    if (!res.ok) {
      showToast('Failed to update permissions', { tone: 'error' })
      return
    }
    showToast('Permissions updated', { tone: 'success' })
  }

  const handleRemoveMember = async (memberUserId) => {
    const res = await apiFetch(`/workspaces/${workspaceId}/members/${memberUserId}`, { method: 'DELETE' })
    if (!res.ok) {
      showToast('Failed to remove member', { tone: 'error' })
      return
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId))
    showToast('Member removed', { tone: 'default' })
  }

  if (!activeWorkspace) return null

  const collaboratorCount = (members ?? []).filter((m) => m.role !== 'owner').length

  return (
    <div className="ws-settings">
      <div className="ws-settings__header">
        <h1>Workspace settings</h1>
        <button className="ws-settings__back" onClick={onBack}>Back to dashboard</button>
      </div>

      <section className="ws-settings__section">
        <h2 className="ws-settings__section-title">General</h2>
        <form onSubmit={handleSaveGeneral} className="ws-settings__general-form">
          <div className="modal__field">
            <label className="modal__label" htmlFor="ws-settings-name">Workspace name</label>
            <input
              id="ws-settings-name"
              className="modal__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="modal__field">
            <label className="modal__label" htmlFor="ws-settings-description">Description</label>
            <textarea
              id="ws-settings-description"
              className="modal__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
          {generalError && <p className="modal__error">{generalError}</p>}
          <button type="submit" className="ws-settings__save-btn" disabled={name.trim() === '' || savingGeneral}>
            {savingGeneral ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>

      <section className="ws-settings__section">
        <div className="ws-settings__section-header">
          <h2 className="ws-settings__section-title">Members</h2>
          <button className="ws-settings__invite-btn" onClick={onOpenShare}>Invite people</button>
        </div>

        {membersError && <p className="ws-settings__error">{membersError}</p>}

        {members === null && !membersError && <p className="ws-settings__loading">Loading members...</p>}

        {members !== null && collaboratorCount === 0 && (
          <div className="ws-settings__empty">
            <p className="ws-settings__empty-title">No collaborators yet</p>
            <p className="ws-settings__empty-subtext">Invite researchers to analyze or contribute to this workspace.</p>
            <button className="ws-settings__invite-btn" onClick={onOpenShare}>Invite people</button>
          </div>
        )}

        {members !== null && members.length > 0 && (
          <div className="ws-settings__member-list">
            {members.map((m) => (
              <MemberRow key={m.user_id} member={m} onUpdate={handleUpdateMember} onRemove={handleRemoveMember} />
            ))}
          </div>
        )}
      </section>

      <section className="ws-settings__section ws-settings__section--danger">
        <h2 className="ws-settings__section-title">Danger zone</h2>
        <div className="ws-settings__danger-row">
          <div>
            <p className="ws-settings__danger-title">Delete this workspace</p>
            <p className="ws-settings__danger-subtext">
              Permanently deletes all datasets, files, and member access. Cannot be undone.
            </p>
          </div>
          <button className="ws-settings__delete-btn" onClick={() => setDeleteOpen(true)}>
            <TrashIcon /> Delete workspace
          </button>
        </div>
      </section>

      <DeleteWorkspaceDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        workspace={activeWorkspace}
        onDeleted={onWorkspaceDeleted}
      />
    </div>
  )
}
