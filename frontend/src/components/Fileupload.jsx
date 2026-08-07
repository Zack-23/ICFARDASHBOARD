// Step 1 of the upload flow: pick files and upload them. Posts to
// /upload, which groups files by header structure but doesn't save or
// combine anything yet -- that only happens once each group gets saved
// (see GroupNaming.jsx). Supports real drag-and-drop.
// Place this at src/components/FileUpload.jsx. Needs its sibling
// Upload.css.
//
// Keeps the original File objects around (not just the /upload
// response) and threads them down to HeaderlessResolver, so it can
// read a raw content preview straight from the browser's copy of the
// file -- no backend round-trip needed for that.

import { useState } from 'react'
import { useAuth } from '../hooks/UseAuth.jsx'
import GroupOverview from './GroupOverview'
import './Upload.css'

export default function FileUpload({ onComplete }) {
  const { apiFetch } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [originalFiles, setOriginalFiles] = useState([])
  const [dragging, setDragging] = useState(false)

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return

    const filesArray = Array.from(fileList)
    const formData = new FormData()
    for (const file of filesArray) {
      formData.append('files', file)
    }

    setUploading(true)
    setError(null)

    try {
      const res = await apiFetch('/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Upload failed')
      }
      const data = await res.json()
      setUploadResult(data)
      setOriginalFiles(filesArray)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  if (uploadResult) {
    return (
      <GroupOverview
        uploadResult={uploadResult}
        originalFiles={originalFiles}
        onComplete={onComplete}
      />
    )
  }

  return (
    <div className="file-upload">
      <label
        className={`file-upload__dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        <svg className="file-upload__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="file-upload__heading">
          {uploading ? 'Uploading...' : 'Drop your sensor files here'}
        </p>
        {!uploading && (
          <p className="file-upload__subtext">or click to browse from your computer</p>
        )}
      </label>
      {error && <p className="file-upload__error">{error}</p>}
    </div>
  )
}