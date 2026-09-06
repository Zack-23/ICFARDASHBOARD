// Permission toggle row -- title + short explanation on the left, a
// real accessible switch on the right. Used identically by the Share
// dialog and Members settings so the two never drift apart visually.
// Place at src/components/ui/Toggle.jsx. Needs its sibling Toggle.css.

import './Toggle.css'

export default function Toggle({ id, label, description, checked, onChange, disabled = false }) {
  return (
    <div className={`toggle-row${disabled ? ' toggle-row--disabled' : ''}`}>
      <div className="toggle-row__text">
        <label className="toggle-row__label" htmlFor={id}>{label}</label>
        {description && <p className="toggle-row__description">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        className={`toggle-switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-switch__thumb" />
      </button>
    </div>
  )
}
