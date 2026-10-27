import { useRef, useState } from 'react'
import { shrinkPhoto } from '../lib/photo'

/** "Use a photo" / "Remove photo": picks a picture, shrinks it, hands back a data URL. */
export function PhotoButtons({ photo, onChange, onError }: { photo: string; onChange: (photo: string) => void; onError?: (message: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="row" style={{ gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        aria-label="Choose a photo"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            onChange(await shrinkPhoto(file))
            onError?.(null)
          } catch (err) {
            onError?.((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
      <button type="button" className="btn small" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Shrinking…' : photo ? '📷 Change photo' : '📷 Use a photo'}
      </button>
      {photo && <button type="button" className="btn small ghost" onClick={() => onChange('')}>Remove photo</button>}
    </div>
  )
}
