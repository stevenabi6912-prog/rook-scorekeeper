import { TRUMPS, type Trump } from '../lib/types'

export function TrumpDot({ trump, size }: { trump: Trump | null | undefined; size?: 'lg' }) {
  const info = TRUMPS.find((t) => t.id === trump)
  if (!info) return null
  return <span className={`trump-dot${size ? ` ${size}` : ''}`} style={{ background: info.color }} aria-hidden />
}

export function TrumpPicker({
  value, onChange, allowClear = true, size,
}: { value: Trump | null | undefined; onChange: (t: Trump | null) => void; allowClear?: boolean; size?: 'grid' }) {
  return (
    <div className={`chips${size === 'grid' ? ' grid-2' : ''}`} role="radiogroup" aria-label="Trump">
      {TRUMPS.map((t) => {
        const selected = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            className={`chip trump${selected ? ' selected' : ''}`}
            style={selected ? { background: t.color } : undefined}
            onClick={() => onChange(selected && allowClear ? null : t.id)}
            aria-pressed={selected}
            aria-label={`${t.label} trump`}
          >
            <TrumpDot trump={t.id} /> {t.label}
          </button>
        )
      })}
    </div>
  )
}
