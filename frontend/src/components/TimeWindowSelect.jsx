// Time window control shared by the graph/table sections on Home. Same
// options as the original demo (24h / 3d / 7d / 14d).
// Place this at src/components/TimeWindowSelect.jsx

const WINDOW_OPTIONS = [
  { label: '24 hours', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
  { label: '14 days', value: 336 },
]

export default function TimeWindowSelect({ hours, onChange }) {
  return (
    <select
      className="time-window-select"
      value={hours}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {WINDOW_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}