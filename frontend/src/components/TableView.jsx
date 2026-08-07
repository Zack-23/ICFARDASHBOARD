// Table section -- two modes. Overview: one column per family (any family
// with more than one member gets a dropdown to swap which member is shown,
// e.g. T01 -> T02), kept to a handful of recent rows. Full: every raw
// column, still capped to a preview -- the complete set is a download,
// not a scroll.
// Place this at src/components/TableView.jsx (replaces the rough
// test-harness version). Needs its sibling Dashboard.css.

import { useMemo, useState } from 'react'
import { groupColumnsByFamily } from '../utils/columnFamilies'
import './Dashboard.css'

const PREVIEW_ROWS = 20

function toCsv(rows, columns) {
  const header = ['datetime', ...columns].join(',')
  const lines = rows.map((row) =>
    ['datetime', ...columns].map((col) => row[col] ?? '').join(',')
  )
  return [header, ...lines].join('\n')
}

function downloadCsv(rows, columns, filename) {
  const csv = toCsv(rows, columns)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function TableView({ rows }) {
  const [mode, setMode] = useState('overview')
  const [representatives, setRepresentatives] = useState({})

  const columns = useMemo(() => {
    if (rows.length === 0) return []
    return Object.keys(rows[0]).filter((key) => key !== 'datetime')
  }, [rows])

  const families = useMemo(() => groupColumnsByFamily(columns), [columns])

  const overviewColumns = useMemo(() => {
    return Array.from(families.entries()).map(([key, members]) => representatives[key] ?? members[0])
  }, [families, representatives])

  const recentRows = useMemo(() => rows.slice(-PREVIEW_ROWS), [rows])

  return (
    <div className="table-view">
      <div className="table-view__tabs">
        <button
          className={mode === 'overview' ? 'active' : ''}
          onClick={() => setMode('overview')}
        >
          Overview
        </button>
        <button
          className={mode === 'full' ? 'active' : ''}
          onClick={() => setMode('full')}
        >
          Full Table
        </button>
      </div>

      {mode === 'overview' ? (
        <>
          <div className="table-view__swaps">
            {Array.from(families.entries())
              .filter(([, members]) => members.length > 1)
              .map(([key, members]) => (
                <label key={key} className="table-view__swap">
                  {key || 'value'}:
                  <select
                    value={representatives[key] ?? members[0]}
                    onChange={(e) =>
                      setRepresentatives((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  >
                    {members.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              ))}
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Datetime</th>
                {overviewColumns.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row, i) => (
                <tr key={i}>
                  <td>{row.datetime}</td>
                  {overviewColumns.map((col) => <td key={col}>{row[col] ?? '\u2014'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Datetime</th>
                {columns.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row, i) => (
                <tr key={i}>
                  <td>{row.datetime}</td>
                  {columns.map((col) => <td key={col}>{row[col] ?? '\u2014'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="table-view__download"
            onClick={() => downloadCsv(rows, columns, 'full_data.csv')}
          >
            Download full CSV
          </button>
        </>
      )}
    </div>
  )
}