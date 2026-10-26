import { useEffect, useState } from 'react'
import { appUrl, buildInviteUrl, shareInvite, type ShareOutcome } from '../lib/invite'

/**
 * "Invite someone": shares a link that joins this family. Phones get their
 * share sheet; elsewhere the link is copied, and if even that fails the link
 * is shown to copy by hand.
 */
export function InviteButton({ code, big }: { code: string; big?: boolean }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)

  useEffect(() => {
    if (outcome !== 'copied' && outcome !== 'shared') return
    const t = setTimeout(() => setOutcome(null), 4000)
    return () => clearTimeout(t)
  }, [outcome])

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        type="button"
        className={`btn block${big ? ' big' : ''}`}
        onClick={() => {
          shareInvite(code).then((r) => setOutcome(r === 'cancelled' ? null : r))
        }}
      >
        📨 Invite someone
      </button>
      {outcome === 'copied' && <div className="small muted center" role="status">Link copied. Paste it into a text.</div>}
      {outcome === 'shared' && <div className="small muted center" role="status">Sent.</div>}
      {outcome === 'failed' && (
        <div className="small muted center" role="status">
          Send them this link:
          <div><code style={{ userSelect: 'all', wordBreak: 'break-all' }}>{buildInviteUrl(appUrl(), code)}</code></div>
        </div>
      )}
    </div>
  )
}
