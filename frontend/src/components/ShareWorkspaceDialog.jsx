

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import { useToast } from './ui/Toast.jsx'
import Modal from './ui/Modal.jsx'
import Toggle from './ui/Toggle.jsx'
import './ui/Modal.css'
import './ShareWorkspaceDialog.css'

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" />
    </svg>
  )
}

function daysUntil(isoString) {
  const diffMs = new Date(isoString).getTime() - Date.now()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return days <= 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`
}

export default function ShareWorkspaceDialog({ open, onClose }) {
  const { apiFetch } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const showToast = useToast()

  const [phase, setPhase] = useState('loading') // loading | configure | ready | existing
  const [canUpload, setCanUpload] = useState(true)
  const [canModifyDatasets, setCanModifyDatasets] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState(null)
  const [linkResult, setLinkResult] = useState(null) // { url, invite }
  const [existingInvite, setExistingInvite] = useState(null)

  const workspaceId = activeWorkspace?.workspace_id

  const loadExisting = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/invites`)
      if (!res.ok) throw new Error('Failed to load invitation state')
      const data = await res.json()
      if (data.invites.length > 0) {
        setExistingInvite(data.invites[0])
        setPhase('existing')
      } else {
        setPhase('configure')
      }
    } catch (err) {
      setError(err.message)
      setPhase('configure')
    }
  }, [apiFetch, workspaceId])

  useEffect(() => {
    if (open && workspaceId) {
      setLinkResult(null)
      loadExisting()
    }
  }, [open, workspaceId, loadExisting])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ can_upload: canUpload, can_modify_datasets: canModifyDatasets }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Failed to create invite link')
      }
      const data = await res.json()
      const url = `${window.location.origin}/invite/${data.token}`
      setLinkResult({ url, invite: data.invite })
      setPhase('ready')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (inviteId) => {
    setRevoking(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke the link')
      setLinkResult(null)
      setExistingInvite(null)
      setCanUpload(true)
      setCanModifyDatasets(false)
      setPhase('configure')
      showToast('Link revoked', { tone: 'default' })
    } catch (err) {
      setError(err.message)
    } finally {
      setRevoking(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkResult.url)
      showToast('Link copied', { tone: 'success' })
    } catch {
      showToast('Could not copy -- select and copy manually', { tone: 'error' })
    }
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const workspaceName = activeWorkspace?.name ?? 'this workspace'

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Share ${workspaceName}`}
      description="Choose what people joining with this link can do."
      width={440}
    >
      {phase === 'loading' && <p className="share-dialog__loading">Loading...</p>}

      {phase === 'configure' && (
        <>
          <div className="share-dialog__toggles">
            <Toggle
              id="share-can-upload"
              label="Upload files & create datasets"
              description="Allow members to upload sensor files and create new datasets."
              checked={canUpload}
              onChange={setCanUpload}
            />
            <Toggle
              id="share-can-modify"
              label="Modify existing datasets"
              description="Allow members to add to, edit, and delete existing workspace datasets."
              checked={canModifyDatasets}
              onChange={setCanModifyDatasets}
            />
          </div>
          <p className="share-dialog__footnote">Everyone who joins can view and analyze workspace data.</p>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__footer">
            <button type="button" className="modal__btn modal__btn--secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="button" className="modal__btn modal__btn--primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create link'}
            </button>
          </div>
        </>
      )}

      {phase === 'ready' && linkResult && (
        <>
          <p className="share-dialog__ready-label">Invite ready</p>
          <div className="share-dialog__link-row">
            <input className="share-dialog__link-input" readOnly value={linkResult.url} onFocus={(e) => e.target.select()} />
            <button type="button" className="share-dialog__copy-btn" onClick={handleCopy}>
              <CopyIcon /> Copy
            </button>
          </div>

          <div className="share-dialog__summary">
            <span className="share-dialog__summary-title">Permissions</span>
            <p className="share-dialog__summary-row">
              {canUpload ? '✓' : '✕'} Upload files & create datasets
            </p>
            <p className="share-dialog__summary-row">
              {canModifyDatasets ? '✓' : '✕'} Modify existing datasets
            </p>
            <p className="share-dialog__expiry">Expires in {daysUntil(linkResult.invite.expires_at)}</p>
          </div>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__footer">
            <button
              type="button"
              className="modal__btn modal__btn--secondary"
              onClick={() => handleRevoke(linkResult.invite.invite_id)}
              disabled={revoking}
            >
              {revoking ? 'Revoking...' : 'Revoke link'}
            </button>
            <button type="button" className="modal__btn modal__btn--primary" onClick={handleClose}>
              Done
            </button>
          </div>
        </>
      )}

      {phase === 'existing' && existingInvite && (
        <>
          <p className="share-dialog__ready-label">A link is already active</p>
          <p className="share-dialog__footnote">
            For security, the link itself isn't stored and can't be shown again. Revoke it below to create a new one.
          </p>

          <div className="share-dialog__summary">
            <span className="share-dialog__summary-title">Permissions</span>
            <p className="share-dialog__summary-row">
              {existingInvite.can_upload ? '✓' : '✕'} Upload files & create datasets
            </p>
            <p className="share-dialog__summary-row">
              {existingInvite.can_modify_datasets ? '✓' : '✕'} Modify existing datasets
            </p>
            <p className="share-dialog__expiry">Expires in {daysUntil(existingInvite.expires_at)}</p>
          </div>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__footer">
            <button type="button" className="modal__btn modal__btn--secondary" onClick={handleClose}>
              Close
            </button>
            <button
              type="button"
              className="modal__btn modal__btn--danger"
              onClick={() => handleRevoke(existingInvite.invite_id)}
              disabled={revoking}
            >
              {revoking ? 'Revoking...' : 'Revoke link'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
