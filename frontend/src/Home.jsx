// Home -- the post-login workspace. On mount, checks whether the user
// already has a most-recently-viewed group: if so, fetches its readings
// and renders the full viewer (time window + graphs + stats + table);
// if not (brand new user, or nothing saved yet), shows the upload flow
// instead. Once a group IS active, an "Upload new files" button is also
// available, so an existing user can start a new upload without losing
// their place.
// Place this at src/Home.jsx.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import FileUpload from './components/FileUpload'
import TimeWindowSelect from './components/TimeWindowSelect'
import IndividualGraph from './components/IndividualGraph'
import Overlaygraph from './components/Overlaygraph'
import Statspanel from './components/Statspanel'
import TableView from './components/TableView'
import './Home.css'

export default function Home() {
  const { session, signOut, apiFetch } = useAuth()

  const [loadingActive, setLoadingActive] = useState(true)
  const [activeGroup, setActiveGroup] = useState(null)
  const [rows, setRows] = useState([])
  const [hours, setHours] = useState(24)
  const [statsColumns, setStatsColumns] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [error, setError] = useState(null)

  const loadReadings = useCallback(async (groupId, windowHours) => {
    const res = await apiFetch(`/groups/${groupId}/readings?hours=${windowHours}`)
    if (!res.ok) throw new Error('Failed to load readings')
    const data = await res.json()
    setActiveGroup(data.group)
    setRows(data.rows)
  }, [apiFetch])

  // On mount: is there a group to auto-load, or is this a brand new
  // user who should just see the upload flow?
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res = await apiFetch('/groups/active')
        if (!res.ok) throw new Error('Failed to check active group')
        const data = await res.json()
        if (cancelled) return

        if (data.group) {
          await loadReadings(data.group.group_id, hours)
        } else {
          setShowUpload(true)
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
  }, [])

  const handleHoursChange = async (newHours) => {
    setHours(newHours)
    if (activeGroup) {
      await loadReadings(activeGroup.group_id, newHours)
    }
  }

  // Called once the upload flow's naming step is fully done -- re-check
  // what's active (it's whatever was just saved, since new groups start
  // as "most recently viewed") and switch back to the workspace view.
  const handleUploadDone = async () => {
    setLoadingActive(true)
    try {
      const res = await apiFetch('/groups/active')
      const data = await res.json()
      if (data.group) {
        await loadReadings(data.group.group_id, hours)
      }
      setShowUpload(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingActive(false)
    }
  }

  return (
    <div className="home">
      <div className="home__header">
        <span>Signed in as {session.user.email}</span>
        <div className="home__header-actions">
          {activeGroup && !showUpload && (
            <button onClick={() => setShowUpload(true)}>Upload new files</button>
          )}
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>

      {loadingActive && <p className="home__loading">Loading...</p>}

      {!loadingActive && error && <p className="file-upload__error">{error}</p>}

      {!loadingActive && showUpload && (
        <FileUpload onComplete={handleUploadDone} />
      )}

      {!loadingActive && !showUpload && activeGroup && (
        <div className="home__workspace">
          <div className="home__workspace-header">
            <h1>{activeGroup.name}</h1>
            <TimeWindowSelect hours={hours} onChange={handleHoursChange} />
          </div>

          <IndividualGraph rows={rows} onFamilyChange={setStatsColumns} />
          <Statspanel rows={rows} columns={statsColumns} hours={hours} />
          <Overlaygraph rows={rows} />
          <TableView rows={rows} />
        </div>
      )}
    </div>
  )
}