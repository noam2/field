import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { InstallCard } from '../components/InstallCard'
import { hasApiKey } from '../openai'
import { getSessionRuntime } from '../session'
import type { Approach } from '../types'
import { formatCoordPlace, formatElapsed } from '../utils'

type Props = { approaches: Approach[] }

export function Log({ approaches }: Props) {
  const rt = getSessionRuntime()
  const snap = useSyncExternalStore(rt.subscribe, rt.getSnapshot, rt.getSnapshot)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!snap.live) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [snap.live])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [snap.transcript, snap.interim])

  const savedHere = approaches.filter((a) => a.sessionId === snap.sessionId).length
  const convCount = Math.max(snap.conversationCount, savedHere)
  const liveText = [snap.transcript, snap.interim].filter(Boolean).join(' ')
  const elapsed = formatElapsed(now - (snap.startedAtMs ?? now))
  const place =
    snap.place || (snap.lat != null && snap.lng != null ? formatCoordPlace(snap.lat, snap.lng) : '—')

  async function start() {
    setBusy(true)
    try {
      await getSessionRuntime().start()
    } finally {
      setBusy(false)
    }
  }

  async function toggle() {
    setBusy(true)
    try {
      if (!snap.live) await getSessionRuntime().start()
      else await getSessionRuntime().stop()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen log">
      {!snap.live && <InstallCard />}
      {snap.error && (
        <div className="error-banner" role="alert">
          <p>{snap.error}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (snap.live) getSessionRuntime().retry()
              else void start()
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="rec-stage">
        <button
          type="button"
          className={snap.live ? 'rec-btn is-live' : 'rec-btn'}
          disabled={busy}
          aria-pressed={snap.live}
          aria-label={snap.live ? 'Stop recording' : 'Start recording'}
          onClick={() => void toggle()}
        >
          {snap.live ? (
            <>
              <span className="rec-dot" aria-hidden="true" />
              <span className="rec-btn-label">Recording</span>
              <span className="rec-btn-time">{elapsed}</span>
            </>
          ) : (
            <span className="rec-btn-label">Record</span>
          )}
        </button>
        {!snap.live && <p className="rec-caption">Tap to record. Enrolled study session.</p>}
      </div>

      {snap.live && (
        <div className="rec-live">
          {snap.resumeNote && (
            <p
              className={
                snap.resumeNote.includes('interrupted') ? 'resume-banner is-warn' : 'resume-banner'
              }
              role="status"
            >
              {snap.resumeNote}
            </p>
          )}
          {snap.speechNote && <p className="speech-note">{snap.speechNote}</p>}
          {!hasApiKey() && (
            <p className="key-warn">Recording without understanding — add key in Settings.</p>
          )}
          <div className="rec-live-meta">
            <p>
              <span className="muted">Place</span> {place}
            </p>
            <p>
              <span className="muted">Conversations</span> {convCount}
            </p>
          </div>
          <div ref={scroller} className="transcript-live is-compact" aria-live="polite" dir="auto">
            {liveText || <span className="muted">Listening…</span>}
          </div>
        </div>
      )}
    </div>
  )
}
