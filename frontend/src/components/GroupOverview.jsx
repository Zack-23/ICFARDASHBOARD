// Step 2 of the upload flow: shows every group /upload detected (by
// header structure), each with a checkbox -- the user picks which ones
// they actually want to keep. Checked groups move on to naming;
// unchecked ones are simply left behind in the temp session.
// Place this at src/components/GroupOverview.jsx. Needs its sibling
// Upload.css (already imported by FileUpload.jsx).

import { useState } from 'react'
import GroupNaming from './GroupNaming'

export default function GroupOverview({ uploadResult, originalFiles, onComplete }) {
  const { group: groups, headerless_buckets: headerlessBuckets, session_id: sessionId } = uploadResult
  const [checked, setChecked] = useState(() => new Set(groups.map((_, i) => i)))
  const [confirmed, setConfirmed] = useState(false)

  const toggle = (index) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (confirmed) {
    const selectedGroups = groups.filter((_, i) => checked.has(i))
    return (
      <GroupNaming
        sessionId={sessionId}
        groups={selectedGroups}
        headerlessBuckets={headerlessBuckets}
        originalFiles={originalFiles}
        onDone={onComplete}
      />
    )
  }

  const headerlessCount = Object.values(headerlessBuckets ?? {}).flat().length

  return (
    <div className="group-overview">
      <h2>Detected groups</h2>
      <p className="group-overview__hint">
        Uncheck anything you don't want to keep from this upload.
      </p>

      {groups.map((group, i) => (
        <label key={i} className="group-overview__row">
          <input
            type="checkbox"
            checked={checked.has(i)}
            onChange={() => toggle(i)}
          />
          <span className="group-overview__columns">{group.display_headers.join(', ')}</span>
          <span className="group-overview__count">{group.files.length} file(s)</span>
        </label>
      ))}

      {headerlessCount > 0 && (
        <p className="group-overview__headerless">
          {headerlessCount} file(s) had no recognizable header and were skipped for now.
        </p>
      )}

      <button
        className="group-overview__continue"
        disabled={checked.size === 0}
        onClick={() => setConfirmed(true)}
      >
        Continue to naming ({checked.size} selected)
      </button>
    </div>
  )
}