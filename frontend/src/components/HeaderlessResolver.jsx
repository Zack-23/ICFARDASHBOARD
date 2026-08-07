// Resolves headerless files left over after naming, one file-structure
// at a time. For each distinct structure (bucketed by column count):
//  - Match found -> shows a quick 2-row preview of the uploaded file
//    side-by-side with a 2-row sample from the matched group's existing
//    data, plus plain text saying "we think this matches" (not a
//    fabricated confidence score). Each side has a download option for
//    when the quick preview isn't enough: the raw uploaded file itself,
//    or the matched group's FULL data as CSV, so the user can compare
//    thoroughly in their own tool if needed. Add/Exclude.
//  - No match -> just the uploaded preview (+ its download), then "do
//    you know these columns?" (yes -> type names once, becomes a new
//    group; no -> discard).
// Purely trust-based throughout -- previews and downloads exist so the
// USER can judge, not so the app can. Reuses /groups/save entirely.
// Place this at src/components/HeaderlessResolver.jsx. Needs its
// sibling Upload.css (already loaded via FileUpload.jsx).

import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 3.9L2.7 18a1.5 1.5 0 001.3 2.2h16a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.4 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4v11M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function findMatchingGroup(columnCount, namedGroups) {
  return namedGroups.find((g) => g.raw_header.length === columnCount) ?? null
}

async function readPreview(file, maxLines = 2) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  return lines.slice(0, maxLines).map((line) => line.trim().split(/\s+/))
}

function downloadOriginalFile(file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}

// Reuses the exact CSV-building approach already used elsewhere in the
// dashboard (TableView's download) -- fetches the group's FULL history
// (a generously large hours window, not just the quick preview sample)
// and downloads it as a real CSV.
async function downloadGroupCsv(apiFetch, group) {
  const res = await apiFetch(`/groups/${group.group_id}/readings?hours=876000`)
  if (!res.ok) return
  const data = await res.json()
  const rows = data.rows
  if (!rows || rows.length === 0) return

  const columns = Object.keys(rows[0]).filter((k) => k !== 'datetime')
  const header = ['datetime', ...columns].join(',')
  const lines = rows.map((row) => ['datetime', ...columns].map((c) => row[c] ?? '').join(','))
  const csv = [header, ...lines].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${group.name}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function PreviewTable({ title, rows, columns, onDownload, downloadLabel }) {
  return (
    <div className="review-preview">
      <div className="review-preview__header">
        <p className="review-preview__title">{title} ({rows.length} rows)</p>
        {onDownload && (
          <button className="review-preview__download" onClick={onDownload}>
            <DownloadIcon /> {downloadLabel}
          </button>
        )}
      </div>
      <div className="review-preview__table-wrap">
        <table className="review-preview__table">
          {columns && (
            <thead>
              <tr>
                {columns.map((c) => <th key={c}>{c}</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => <td key={c}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FileReviewCard({ sessionId, columnCount, filenames, namedGroups, originalFiles, onResolved }) {
  const { apiFetch } = useAuth()
  const match = findMatchingGroup(Number(columnCount), namedGroups)

  const [status, setStatus] = useState('idle') // idle | saving | done | error | rejected
  const [error, setError] = useState(null)
  const [showColumnForm, setShowColumnForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [columnNames, setColumnNames] = useState('')

  const [uploadedPreview, setUploadedPreview] = useState(null)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const [groupSample, setGroupSample] = useState(null)

  const filename = filenames[0]
  const originalFile = originalFiles?.find((f) => f.name === filename)

  useEffect(() => {
    if (!originalFile) {
      // eslint-disable-next-line no-console
      console.warn(
        `Could not find original file for preview: "${filename}". Available names:`,
        originalFiles?.map((f) => f.name)
      )
      setPreviewUnavailable(true)
      return
    }
    readPreview(originalFile)
      .then(setUploadedPreview)
      .catch(() => setPreviewUnavailable(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename])

  useEffect(() => {
    if (!match) return
    let cancelled = false
    apiFetch(`/groups/${match.group_id}/sample?limit=2`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setGroupSample(data.rows)
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.group_id])

  const addToGroup = async () => {
    setStatus('saving')
    setError(null)
    try {
      const res = await apiFetch('/groups/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          groups: [{
            name: match.name,
            headers: match.headers,
            raw_header: match.raw_header,
            filenames,
          }],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Save failed')
      }
      setStatus('done')
      onResolved()
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  const saveNewGroup = async () => {
    const expectedCount = Number(columnCount) - 2
    const typed = columnNames.split(',').map((s) => s.trim()).filter(Boolean)

    if (newGroupName.trim() === '') {
      setError('Give this group a name first.')
      return
    }
    if (typed.length !== expectedCount) {
      setError(`Expected ${expectedCount} column name(s), got ${typed.length}.`)
      return
    }

    setStatus('saving')
    setError(null)
    try {
      const rawHeader = ['col0', 'col1', ...typed]
      const headers = typed.map((t) => t.toLowerCase())

      const res = await apiFetch('/groups/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          groups: [{
            name: newGroupName.trim(),
            headers,
            raw_header: rawHeader,
            filenames,
          }],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Save failed')
      }
      setStatus('done')
      onResolved()
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  const exclude = () => {
    setStatus('rejected')
    onResolved()
  }

  const uploadedPreviewBlock = uploadedPreview ? (
    <PreviewTable
      title={`${filename} preview`}
      rows={uploadedPreview}
      onDownload={originalFile ? () => downloadOriginalFile(originalFile) : null}
      downloadLabel="Download original file"
    />
  ) : previewUnavailable ? (
    <div className="review-preview">
      <p className="review-preview__title">{filename} preview</p>
      <p className="review-card__hint">Preview unavailable for this file.</p>
    </div>
  ) : null

  return (
    <div className="review-card">
      <div className="review-card__filebar">
        <span className="review-card__file-icon"><DocumentIcon /></span>
        <span className="review-card__filename">{filename}</span>
        {filenames.length > 1 && (
          <span className="review-card__filecount">+{filenames.length - 1} more</span>
        )}
        <span className="review-card__badge">
          <WarningIcon /> No header found
        </span>
      </div>

      {match ? (
        <>
          <div className="review-card__match">
            <span className="review-card__match-avatar">{match.name.slice(0, 3).toUpperCase()}</span>
            <span className="review-card__match-name">{match.name}</span>
            <span className="review-card__match-note">
              <CheckIcon /> We think this matches this group
            </span>
          </div>

          <div className="review-card__compare">
            {uploadedPreviewBlock}
            {groupSample && groupSample.length > 0 && (
              <PreviewTable
                title={`${match.name} sample`}
                rows={groupSample.map((row) => Object.values(row))}
                columns={Object.keys(groupSample[0])}
                onDownload={() => downloadGroupCsv(apiFetch, match)}
                downloadLabel={`Download ${match.name} data (CSV)`}
              />
            )}
          </div>

          <p className="review-card__hint">
            {filenames.length} file(s) with no header, {columnCount} columns.
          </p>

          <div className="review-card__actions">
            <button className="review-card__add" onClick={addToGroup} disabled={status === 'saving'}>
              <CheckIcon /> {status === 'saving' ? 'Adding...' : 'Add to group'}
            </button>
            <button className="review-card__exclude" onClick={exclude} disabled={status === 'saving'}>
              <TrashIcon /> Exclude
            </button>
          </div>
        </>
      ) : (
        <>
          {uploadedPreviewBlock && (
            <div className="review-card__compare review-card__compare--single">
              {uploadedPreviewBlock}
            </div>
          )}

          {!showColumnForm ? (
            <>
              <p className="review-card__hint">
                {filenames.length} file(s), {columnCount} columns -- doesn't match any group you just
                named. Do you recognize what these columns are from the preview above?
              </p>
              <div className="review-card__actions">
                <button className="review-card__add" onClick={() => setShowColumnForm(true)}>
                  Yes, I know them
                </button>
                <button className="review-card__exclude" onClick={exclude}>
                  <TrashIcon /> No, exclude
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="review-card__hint">
                The first two columns are assumed to be date and time. Name the remaining{' '}
                {Number(columnCount) - 2} column(s), in order, separated by commas.
              </p>
              <input
                type="text"
                className="review-card__input"
                placeholder="Group name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <input
                type="text"
                className="review-card__input"
                placeholder="e.g. T01, T02, VWC1"
                value={columnNames}
                onChange={(e) => setColumnNames(e.target.value)}
              />
              <div className="review-card__actions">
                <button className="review-card__add" onClick={saveNewGroup} disabled={status === 'saving'}>
                  <CheckIcon /> {status === 'saving' ? 'Saving...' : 'Save as new group'}
                </button>
                <button className="review-card__exclude" onClick={exclude} disabled={status === 'saving'}>
                  <TrashIcon /> Exclude instead
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && <p className="group-naming__status error">{error}</p>}
    </div>
  )
}

export default function HeaderlessResolver({ sessionId, headerlessBuckets, namedGroups, originalFiles, onDone }) {
  const bucketEntries = Object.entries(headerlessBuckets)
  const [currentIndex, setCurrentIndex] = useState(0)
  const allDone = bucketEntries.length === 0 || currentIndex >= bucketEntries.length

  useEffect(() => {
    if (allDone) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone])

  if (allDone) {
    return null
  }

  const [columnCount, filenames] = bucketEntries[currentIndex]

  return (
    <div className="review-screen">
      <div className="review-screen__header">
        <span className="review-screen__icon"><DocumentIcon /></span>
        <div>
          <h1>Files needing review</h1>
          <p>
            {bucketEntries.length > 1
              ? `File ${currentIndex + 1} of ${bucketEntries.length} with no recognizable header.`
              : "This file didn't have a recognizable header."}
          </p>
        </div>
      </div>

      <FileReviewCard
        key={columnCount}
        sessionId={sessionId}
        columnCount={columnCount}
        filenames={filenames}
        namedGroups={namedGroups}
        originalFiles={originalFiles}
        onResolved={() => setCurrentIndex((i) => i + 1)}
      />
    </div>
  )
}