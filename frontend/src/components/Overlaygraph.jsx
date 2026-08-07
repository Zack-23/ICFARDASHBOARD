// Overlay Graph -- same family-expansion logic as Individual Graph, two
// dropdowns picking families A and B for a dual-axis comparison, plus a
// chart-type selector (Line/Area/Points) applied to both. Dashing (to
// visually tell A from B) only applies in Line mode -- dashed areas or
// dashed point markers don't read as clearly, so A/B distinction relies
// on color alone in those modes. connectNulls is explicitly false: a
// real gap in the data shows as a visible break, never smoothed through.
// Place this at src/components/Overlaygraph.jsx. Needs Dashboard.css.

import { useMemo, useState, useEffect } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { groupColumnsByFamily, getFamilyMembers } from '../utils/columnFamilies'
import './Dashboard.css'

const COLORS_A = ['#29C7F6', '#B8822C', '#C4693A', '#9A6B24']
const COLORS_B = ['#FB923C', '#5B7A9E', '#4C8C6B', '#7A8794']

function renderSeries(chartType, col, color, yAxisId, dashed) {
  if (chartType === 'area') {
    return (
      <Area
        key={col}
        yAxisId={yAxisId}
        type="monotone"
        dataKey={col}
        stroke={color}
        fill={color}
        fillOpacity={0.15}
        dot={false}
        connectNulls={false}
      />
    )
  }
  if (chartType === 'points') {
    return (
      <Line
        key={col}
        yAxisId={yAxisId}
        type="monotone"
        dataKey={col}
        stroke="none"
        dot={{ r: 3, fill: color }}
        connectNulls={false}
        isAnimationActive={false}
      />
    )
  }
  return (
    <Line
      key={col}
      yAxisId={yAxisId}
      type="monotone"
      dataKey={col}
      stroke={color}
      strokeDasharray={dashed ? '4 3' : undefined}
      dot={false}
      connectNulls={false}
    />
  )
}

export default function Overlaygraph({ rows, onFamiliesChange }) {
  const columns = useMemo(() => {
    if (rows.length === 0) return []
    return Object.keys(rows[0]).filter((key) => key !== 'datetime')
  }, [rows])

  const families = useMemo(() => groupColumnsByFamily(columns), [columns])
  const familyKeys = useMemo(() => Array.from(families.keys()), [families])

  const [selectedA, setSelectedA] = useState('')
  const [selectedB, setSelectedB] = useState('')
  const [chartType, setChartType] = useState('line')

  useEffect(() => {
    if (familyKeys.length > 0 && !selectedA) setSelectedA(families.get(familyKeys[0])[0])
    if (familyKeys.length > 1 && !selectedB) setSelectedB(families.get(familyKeys[1])[0])
  }, [familyKeys])

  const familyA = selectedA ? getFamilyMembers(columns, selectedA) : []
  const familyB = selectedB ? getFamilyMembers(columns, selectedB) : []

  useEffect(() => {
    onFamiliesChange?.([...familyA, ...familyB])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedA, selectedB, columns])

  if (columns.length === 0) {
    return (
      <div className="overlay-graph">
        <h2>Overlay Graph</h2>
        <p className="graph-empty">No numeric columns to overlay yet.</p>
      </div>
    )
  }

  return (
    <div className="overlay-graph">
      <div className="overlay-graph__header">
        <h2>Overlay Graph</h2>
        <div className="overlay-graph__selects">
          <select className="dashboard-select" value={chartType} onChange={(e) => setChartType(e.target.value)}>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="points">Points</option>
          </select>
          <select className="dashboard-select" value={selectedA} onChange={(e) => setSelectedA(e.target.value)}>
            {familyKeys.map((key) => {
              const representative = families.get(key)[0]
              return <option key={key} value={representative}>{key || representative}</option>
            })}
          </select>
          <span className="overlay-graph__vs">vs</span>
          <select className="dashboard-select" value={selectedB} onChange={(e) => setSelectedB(e.target.value)}>
            {familyKeys.map((key) => {
              const representative = families.get(key)[0]
              return <option key={key} value={representative}>{key || representative}</option>
            })}
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="datetime" tick={{ fontSize: 11, fill: '#6F8097' }} minTickGap={40} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6F8097' }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6F8097' }} />
          <Tooltip
            offset={28}
            allowEscapeViewBox={{ x: true, y: true }}
            contentStyle={{ background: '#132238', border: '1px solid #22324A', borderRadius: 8 }}
            labelStyle={{ color: '#9AA9BD', fontSize: 12 }}
            itemStyle={{ color: '#F3F8FF', fontSize: 12 }}
          />
          <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 11, paddingTop: 10, color: '#9AA9BD' }} />
          {familyA.map((col, i) => renderSeries(chartType, col, COLORS_A[i % COLORS_A.length], 'left', false))}
          {familyB.map((col, i) => renderSeries(chartType, col, COLORS_B[i % COLORS_B.length], 'right', true))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}