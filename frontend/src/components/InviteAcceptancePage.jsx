

import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import './InviteAcceptancePage.css'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CapabilityRow({ granted, children }) {
  return (
    <li className={`invite-page__capability${granted ? '' : ' invite-page__capability--denied'}`}>
      <span className="invite-page__capability-icon">{granted ? <CheckIcon /> : <XIcon />}</span>
      {children}
    </li>
  )
}

export default function InviteAcceptancePage({ token, onDone }) {
  const { session, apiFetch, signInWithGoogle } = useAuth()
  const { refreshWorkspaces, switchWorkspace } = useWorkspace()

  const [preview, setPreview] = useState(null) // null while loading
  const [error, setError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`/invites/${token}`)
        if (!res.ok) throw new Error('Failed to load this invitation')
        const data = await res.json()
        if (!cancelled) setPreview(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session])

  const handleAccept = async () => {
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await apiFetch(`/invites/${token}/accept`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Failed to join this workspace')
      }
      const data = await res.json()
      await refreshWorkspaces()
      await switchWorkspace(data.workspace.workspace_id)
      onDone()
    } catch (err) {
      setAcceptError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  let body
  if (error) {
    body = <p className="invite-page__message invite-page__message--error">{error}</p>
  } else if (!preview) {
    body = <p className="invite-page__message">Loading invitation...</p>
  } else if (preview.status === 'not_found') {
    body = <p className="invite-page__message">This invitation is no longer available.</p>
  } else if (preview.status === 'revoked') {
    body = <p className="invite-page__message">This invitation is no longer available.</p>
  } else if (preview.status === 'expired') {
    body = <p className="invite-page__message">This invitation has expired.</p>
  } else {
    const isMember = preview.status === 'already_member'
    body = (
      <>
        <span className="invite-page__eyebrow">You've been invited to join</span>
        <h1 className="invite-page__workspace-name">{preview.workspace_name}</h1>

        {isMember ? (
          <p className="invite-page__message">You already belong to this workspace.</p>
        ) : (
          <>
            <p className="invite-page__hint">You'll be able to:</p>
            <ul className="invite-page__capabilities">
              <CapabilityRow granted>View and analyze datasets</CapabilityRow>
              <CapabilityRow granted={preview.can_upload}>Upload files and create datasets</CapabilityRow>
              <CapabilityRow granted={preview.can_modify_datasets}>Modify existing datasets</CapabilityRow>
            </ul>
          </>
        )}

        {acceptError && <p className="invite-page__message invite-page__message--error">{acceptError}</p>}

        {isMember ? (
          <button className="invite-page__primary" onClick={onDone}>Open workspace</button>
        ) : session ? (
          <button className="invite-page__primary" onClick={handleAccept} disabled={accepting}>
            {accepting ? 'Joining...' : 'Join workspace'}
          </button>
        ) : (
          <button className="invite-page__primary" onClick={signInWithGoogle}>
            Sign in to accept
          </button>
        )}
      </>
    )
  }

  return (
    <div className="invite-page">
      <div className="invite-page__card">{body}</div>
    </div>
  )
}
