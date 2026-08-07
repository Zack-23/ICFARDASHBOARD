// Step 3 of the upload flow: one name field per checked group, each with
// its own always-visible Save button (Enter still works too). Once
// saving is done, either goes straight to "View dashboard" or -- if
// this upload also had headerless files -- routes into
// HeaderlessResolver first, passing along what got saved (name +
// headers + raw_header) so it can check for structure matches.
// Place this at src/components/GroupNaming.jsx. Needs its sibling
// Upload.css (already imported by FileUpload.jsx).

import { useState } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import HeaderlessResolver from './HeaderlessResolver'

function GroupNameRow({ sessionId, group, onSaved }) {
  const { apiFetch } = useAuth()
  const [name, setName] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [error, setError] = useState(null)

  const save = async () => {
    if (name.trim() === '' || status === 'saving' || status === 'saved') return
    setStatus('saving')
    setError(null)

    try {
      const res = await apiFetch('/groups/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          groups: [{
            name: name.trim(),
            headers: group.headers,
            raw_header: group.raw_header,
            filenames: group.files,
          }],
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Save failed')
      }

      const data = await res.json()
      const savedGroupId = data.groups[0].group_id

      setStatus('saved')
      onSaved({
        name: name.trim(),
        headers: group.headers,
        raw_header: group.raw_header,
        group_id: savedGroupId,
      })
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  return (
    <div className="group-naming__row">
      <span className="group-naming__columns">{group.display_headers.join(', ')}</span>
      <input
        type="text"
        placeholder="Name this group..."
        value={name}
        disabled={status === 'saving' || status === 'saved'}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save() }}
      />
      <button
        className="group-naming__save"
        onClick={save}
        disabled={name.trim() === '' || status === 'saving' || status === 'saved'}
      >
        {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save'}
      </button>
      {status === 'error' && <span className="group-naming__status error">{error}</span>}
    </div>
  )
}

export default function GroupNaming({ sessionId, groups, headerlessBuckets, originalFiles, onDone }) {
  const [savedGroups, setSavedGroups] = useState([])
  const [resolvingHeaderless, setResolvingHeaderless] = useState(false)

  const hasHeaderless = headerlessBuckets && Object.keys(headerlessBuckets).length > 0

  if (resolvingHeaderless) {
    return (
      <HeaderlessResolver
        sessionId={sessionId}
        headerlessBuckets={headerlessBuckets}
        namedGroups={savedGroups}
        originalFiles={originalFiles}
        onDone={onDone}
      />
    )
  }

  return (
    <div className="group-naming">
      <h2>Name your groups</h2>
      {groups.map((group, i) => (
        <GroupNameRow
          key={i}
          sessionId={sessionId}
          group={group}
          onSaved={(info) => setSavedGroups((prev) => [...prev, info])}
        />
      ))}

      {savedGroups.length > 0 && (
        <button
          className="group-naming__done"
          onClick={() => (hasHeaderless ? setResolvingHeaderless(true) : onDone())}
        >
          {hasHeaderless
            ? `Continue (${savedGroups.length} of ${groups.length} saved)`
            : `View dashboard (${savedGroups.length} of ${groups.length} saved)`}
        </button>
      )}
    </div>
  )
}