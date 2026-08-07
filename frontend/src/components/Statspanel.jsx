// Stats panel -- ONE card with a "Stats view" radio toggle, matching
// the original Streamlit demo's exact pattern (Single metric / Stats
// table / Box plot), rather than three separately-visible sections.
//  - Single metric: pick one column, see its full stat row alone.
//  - Stats table: every column in the family, one row each (unchanged
//    Overview 2-row default / Full Table toggle from before).
//  - Box plot: hand-built SVG (Recharts has no native box-plot type),
//    with checkboxes to control which of the family's columns actually
//    show as boxes -- defaults to all, narrows down on request.
// All computed client-side from `rows`, consistent with the rest of
// this component. Used for both Individual Graph's and Overlay Graph's
// stats -- Home renders two instances of this same component.
// Place this at src/components/Statspanel.jsx. Needs Dashboard.css.

import { useMemo, useState, useEffect } from 'react'
import { splitTimeWindows } from '../utils/timeWindows'
import './Dashboard.css'

const OVERVIEW_ROWS = 2

// Coerces to a real number whether the value arrived as a number or a
// numeric string (e.g. "23.5") -- defensive on top of the backend fix
// that now stores real numbers, since any group saved before that fix
// still has string values sitting in the database until it's re-saved.
function toNumber(v) {
  if (v === null || v === undefined || v === '') return NaN
  return typeof v === 'number' ? v : Number(v)
}

function computeStats(values) {
  const clean = values.map(toNumber).filter((v) => !Number.isNaN(v))
  if (clean.length === 0) {
    return { mean: null, median: null, min: null, max: null, std: null }
  }
  const sorted = [...clean].sort((a, b) => a - b)
  const mean = clean.reduce((sum, v) => sum + v, 0) / clean.length
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const variance = clean.length > 1
    ? clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (clean.length - 1)
    : 0
  return { mean, median, min: sorted[0], max: sorted[sorted.length - 1], std: Math.sqrt(variance) }
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

function computeBoxStats(values) {
  const clean = values.map(toNumber).filter((v) => !Number.isNaN(v))
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  return {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  }
}

function StatRow({ label, s }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{s.mean?.toFixed(4) ?? '\u2014'}</td>
      <td>{s.median?.toFixed(4) ?? '\u2014'}</td>
      <td>{s.min?.toFixed(4) ?? '\u2014'}</td>
      <td>{s.max?.toFixed(4) ?? '\u2014'}</td>
      <td>{s.std?.toFixed(4) ?? '\u2014'}</td>
    </tr>
  )
}

function BoxPlotChart({ data }) {
  const valid = data.filter((d) => d.stats)
  if (valid.length === 0) {
    return <p className="graph-empty">Select at least one variable to plot.</p>
  }

  const globalMin = Math.min(...valid.map((d) => d.stats.min))
  const globalMax = Math.max(...valid.map((d) => d.stats.max))
  const padding = (globalMax - globalMin) * 0.1 || 1
  const yMin = globalMin - padding
  const yMax = globalMax + padding

  const width = 700
  const height = 320
  const marginLeft = 54
  const marginBottom = 30
  const marginTop = 12
  const plotRight = width - 16
  const plotWidth = plotRight - marginLeft
  const plotHeight = height - marginTop - marginBottom

  const yScale = (v) => marginTop + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight
  const step = plotWidth / valid.length
  const boxWidth = Math.min(46, step * 0.5)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="boxplot-svg" preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const v = yMin + t * (yMax - yMin)
        const y = yScale(v)
        return (
          <g key={t}>
            <line x1={marginLeft} y1={y} x2={plotRight} y2={y} className="boxplot-gridline" />
            <text x={marginLeft - 8} y={y + 4} textAnchor="end" className="boxplot-axis-label">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}

      {valid.map((d, i) => {
        const cx = marginLeft + step * i + step / 2
        const { min, q1, median, q3, max } = d.stats
        return (
          <g key={d.label}>
            <line x1={cx} y1={yScale(min)} x2={cx} y2={yScale(max)} className="boxplot-whisker" />
            <line x1={cx - 8} y1={yScale(min)} x2={cx + 8} y2={yScale(min)} className="boxplot-whisker" />
            <line x1={cx - 8} y1={yScale(max)} x2={cx + 8} y2={yScale(max)} className="boxplot-whisker" />
            <rect
              x={cx - boxWidth / 2}
              y={yScale(q3)}
              width={boxWidth}
              height={Math.max(1, yScale(q1) - yScale(q3))}
              className="boxplot-box"
            />
            <line
              x1={cx - boxWidth / 2}
              y1={yScale(median)}
              x2={cx + boxWidth / 2}
              y2={yScale(median)}
              className="boxplot-median"
            />
            <text x={cx} y={height - 8} textAnchor="middle" className="boxplot-axis-label">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Statspanel({ rows, columns, hours }) {
  const [statsView, setStatsView] = useState('single') // 'single' | 'table' | 'box'
  const [singleMetricCol, setSingleMetricCol] = useState('')
  const [tableMode, setTableMode] = useState('compact') // 'compact' | 'full' -- Stats table view only
  const [boxColumns, setBoxColumns] = useState([])

  const { current } = useMemo(() => splitTimeWindows(rows, hours), [rows, hours])

  const statsByColumn = useMemo(() => {
    const result = {}
    for (const col of columns) {
      result[col] = computeStats(current.map((r) => r[col]))
    }
    return result
  }, [current, columns])

  useEffect(() => {
    if (columns.length > 0 && !columns.includes(singleMetricCol)) {
      setSingleMetricCol(columns[0])
    }
  }, [columns]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBoxColumns(columns)
  }, [columns])

  const boxData = useMemo(
    () => boxColumns.map((col) => ({ label: col, stats: computeBoxStats(current.map((r) => r[col])) })),
    [current, boxColumns]
  )

  if (columns.length === 0) {
    return (
      <div className="stats-panel">
        <h2>Summary Statistics</h2>
        <p className="graph-empty">Select a graph above to see its statistics.</p>
      </div>
    )
  }

  const tableColumns = tableMode === 'compact' ? columns.slice(0, OVERVIEW_ROWS) : columns

  return (
    <div className="stats-panel">
      <h2>Summary Statistics</h2>

      <span className="stats-panel__field-label">Stats view</span>
      <div className="stats-panel__radios">
        <label>
          <input type="radio" checked={statsView === 'single'} onChange={() => setStatsView('single')} />
          Single metric
        </label>
        <label>
          <input type="radio" checked={statsView === 'table'} onChange={() => setStatsView('table')} />
          Stats table
        </label>
        <label>
          <input type="radio" checked={statsView === 'box'} onChange={() => setStatsView('box')} />
          Box plot
        </label>
      </div>

      {statsView === 'single' && (
        <>
          <span className="stats-panel__field-label">Metric</span>
          <select
            className="dashboard-select"
            value={singleMetricCol}
            onChange={(e) => setSingleMetricCol(e.target.value)}
          >
            {columns.map((col) => <option key={col} value={col}>{col}</option>)}
          </select>

          <table className="stats-table stats-panel__table-spaced">
            <thead>
              <tr>
                <th></th>
                <th>Mean</th>
                <th>Median</th>
                <th>Min</th>
                <th>Max</th>
                <th>Std</th>
              </tr>
            </thead>
            <tbody>
              {singleMetricCol && statsByColumn[singleMetricCol] && (
                <StatRow label={singleMetricCol} s={statsByColumn[singleMetricCol]} />
              )}
            </tbody>
          </table>
        </>
      )}

      {statsView === 'table' && (
        <>
          {columns.length > OVERVIEW_ROWS && (
            <div className="table-view__tabs stats-panel__table-spaced">
              <button
                className={tableMode === 'compact' ? 'active' : ''}
                onClick={() => setTableMode('compact')}
              >
                Overview
              </button>
              <button
                className={tableMode === 'full' ? 'active' : ''}
                onClick={() => setTableMode('full')}
              >
                Full Table
              </button>
            </div>
          )}

          <table className="stats-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Mean</th>
                <th>Median</th>
                <th>Min</th>
                <th>Max</th>
                <th>Std</th>
              </tr>
            </thead>
            <tbody>
              {tableColumns.map((col) => (
                <StatRow key={col} label={col} s={statsByColumn[col]} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {statsView === 'box' && (
        <>
          <span className="stats-panel__field-label">Variables to show</span>
          <div className="stats-panel__checkboxes">
            {columns.map((col) => (
              <label key={col}>
                <input
                  type="checkbox"
                  checked={boxColumns.includes(col)}
                  onChange={() => setBoxColumns((prev) =>
                    prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
                  )}
                />
                {col}
              </label>
            ))}
          </div>

          <BoxPlotChart data={boxData} />
        </>
      )}
    </div>
  )
}