import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

  async function start() {
    setBusy(true)
    try {
      await getSessionRuntime().start()
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    try {
      await getSessionRuntime().stop()
    } finally {
      setBusy(false)
    }
  }

  if (!snap.live) {
    return (
      <div className="screen log">
        <header className="screen-head">
          <p className="eyebrow">Study session</p>
          <h1>Log</h1>
        </header>
        <p>
          Location will be stored as metadata on each conversation. Audio and a live transcript
          run until you stop. Keep this screen visible.
        </p>
        <p className="consent">
          I am a study participant and everyone speaking is an enrolled study participant. I agree
          that this phone will record audio and location until I tap Stop. A visible REC indicator
          stays on.
        </p>
        {snap.error && (
          <div className="error-banner" role="alert">
            <p>{snap.error}</p>
            <button type="button" className="btn-secondary" onClick={() => void start()}>
              Retry
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn-primary btn-huge"
          disabled={busy}
          onClick={() => void start()}
        >
          Start session
        </button>
      </div>
    )
  }

  const elapsed = formatElapsed(now - (snap.startedAtMs ?? now))
  const coords =
    snap.lat != null && snap.lng != null
      ? `${snap.lat.toFixed(5)}, ${snap.lng.toFixed(5)}${
          snap.accuracy != null ? ` · ±${Math.round(snap.accuracy)}m` : ''
        }`
      : 'Waiting for GPS…'
  const place = snap.place || (snap.lat != null && snap.lng != null ? formatCoordPlace(snap.lat, snap.lng) : '—')

  return (
    <div className="screen log">
      <div className="rec-banner" role="status" aria-live="polite">
        <span className="rec-dot" aria-hidden="true" />
        <div className="rec-copy">
          <p className="rec-title">REC · session live</p>
          <p className="muted">Audio and location on · {elapsed}</p>
        </div>
      </div>

      <p className="hint">
        Android can keep the mic with the screen off. iPhone Safari stops audio when you leave Field
        — keep the app on screen.
      </p>
      {snap.resumeNote && (
        <p className={snap.resumeNote.includes('interrupted') ? 'resume-banner is-warn' : 'resume-banner'} role="status">
          {snap.resumeNote}
        </p>
      )}

      {snap.speechNote && <p className="speech-note">{snap.speechNote}</p>}
      {!hasApiKey() && (
        <p className="key-warn">Recording without understanding — add key in Settings.</p>
      )}
      {snap.error && (
        <div className="error-banner" role="alert">
          <p>{snap.error}</p>
          <button type="button" className="btn-secondary" onClick={() => getSessionRuntime().retry()}>
            Retry
          </button>
        </div>
      )}

      <div className="meta-grid">
        <p>
          <span className="muted">Place</span>
          <br />
          {place}
        </p>
        <p>
          <span className="muted">Coords</span>
          <br />
          {coords}
        </p>
        <p>
          <span className="muted">Conversations</span>
          <br />
          {convCount}
        </p>
      </div>

      <p className="section-title">Live transcript</p>
      <div ref={scroller} className="transcript-live" aria-live="polite" dir="auto">
        {liveText || <span className="muted">Listening…</span>}
      </div>

      <button type="button" className="btn-danger btn-huge" disabled={busy} onClick={() => void stop()}>
        Stop session
      </button>
    </div>
  )
}
