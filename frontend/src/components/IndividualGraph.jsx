// Individual Graph -- one dropdown for which family to show (selecting
// a column expands to every column in that family), and a second for
// how to render it: Line, Area, or Points. All three stay time-anchored
// on the X-axis -- only the visual style changes, not the chart type.
// connectNulls is explicitly false: a real gap in the data (a sensor
// outage) shows as a visible break in the line, never smoothed through
// as if the data were continuous when it wasn't.
// Place this at src/components/IndividualGraph.jsx. Needs
// `npm install recharts` if not already installed, plus Dashboard.css.

import { useMemo, useState, useEffect } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer,
} from 'recharts'
import { groupColumnsByFamily, getFamilyMembers } from '../utils/columnFamilies'
import './Dashboard.css'

const LINE_COLORS = ['#29C7F6', '#4DD8FF', '#7C9CFF', '#A78BFA', '#F472B6', '#FB923C', '#34D399', '#FACC15']

function renderSeries(chartType, col, color) {
  if (chartType === 'area') {
    return (
      <Area
        key={col}
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
      type="monotone"
      dataKey={col}
      stroke={color}
      dot={false}
      connectNulls={false}
    />
  )
}

export default function IndividualGraph({ rows, onFamilyChange }) {
  const columns = useMemo(() => {
    if (rows.length === 0) return []
    return Object.keys(rows[0]).filter((key) => key !== 'datetime')
  }, [rows])

  const families = useMemo(() => groupColumnsByFamily(columns), [columns])

  const [selected, setSelected] = useState('')
  const [chartType, setChartType] = useState('line')

  useEffect(() => {
    if (columns.length > 0 && !columns.includes(selected)) {
      setSelected(columns[0])
    }
  }, [columns])

  const familyColumns = useMemo(
    () => (selected ? getFamilyMembers(columns, selected) : []),
    [columns, selected]
  )

  useEffect(() => {
    onFamilyChange?.(familyColumns)
  }, [familyColumns])

  if (columns.length === 0) {
    return (
      <div className="individual-graph">
        <h2>Individual Graph</h2>
        <p className="graph-empty">No numeric columns to graph yet.</p>
      </div>
    )
  }

  return (
    <div className="individual-graph">
      <div className="individual-graph__header">
        <h2>Individual Graph</h2>
        <div className="individual-graph__controls">
          <select className="dashboard-select" value={chartType} onChange={(e) => setChartType(e.target.value)}>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="points">Points</option>
          </select>
          <select className="dashboard-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {Array.from(families.keys()).map((key) => {
              const representative = families.get(key)[0]
              return <option key={key} value={representative}>{key || representative}</option>
            })}
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={390}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="datetime" tick={{ fontSize: 11, fill: '#6F8097' }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11, fill: '#6F8097' }} />
          <Tooltip
            offset={28}
            allowEscapeViewBox={{ x: true, y: true }}
            contentStyle={{ background: '#132238', border: '1px solid #22324A', borderRadius: 8 }}
            labelStyle={{ color: '#9AA9BD', fontSize: 12 }}
            itemStyle={{ color: '#F3F8FF', fontSize: 12 }}
          />
          <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 11, paddingTop: 10, color: '#9AA9BD' }} />
          {familyColumns.map((col, i) => renderSeries(chartType, col, LINE_COLORS[i % LINE_COLORS.length]))}
          {rows.length > 20 && (
            <Brush
              dataKey="datetime"
              height={26}
              stroke="#29C7F6"
              fill="#132238"
              travellerWidth={8}
              tickFormatter={() => ''}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}