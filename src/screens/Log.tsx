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
  const scroller = useRef<HTMLDivElement>(null)
  const recordingUi = snap.phase === 'starting' || snap.phase === 'live'

  useEffect(() => {
    if (!recordingUi) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [recordingUi])

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

  async function retryStart() {
    await getSessionRuntime().start()
  }

  async function toggle() {
    const cur = getSessionRuntime().getSnapshot()
    if (cur.phase === 'idle') await getSessionRuntime().start()
    else if (cur.phase === 'live' || cur.phase === 'starting') await getSessionRuntime().stop()
  }

  const recClass =
    snap.phase === 'starting'
      ? 'rec-btn is-live is-starting'
      : snap.phase === 'live'
        ? 'rec-btn is-live'
        : 'rec-btn'

  const recAria =
    snap.phase === 'live'
      ? 'Stop recording'
      : snap.phase === 'starting'
        ? 'Starting recording'
        : 'Start recording'

  const caption =
    snap.phase === 'live'
      ? 'Tap to stop'
      : snap.phase === 'starting'
        ? 'Allow microphone access'
        : 'Tap to record.'

  return (
    <div className={recordingUi ? 'screen log is-recording' : 'screen log'}>
      {snap.phase === 'idle' && <InstallCard />}
      {snap.error && (
        <div className="error-banner" role="alert">
          <p>{snap.error}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (snap.live) getSessionRuntime().retry()
              else void retryStart()
            }}
          >
            Retry
          </button>
        </div>
      )}

      {recordingUi && (
        <div className="rec-banner" role="status">
          <span className="rec-dot" aria-hidden="true" />
          <div className="rec-copy">
            <span className="rec-title">REC ON</span>
            <span className="rec-banner-time">{elapsed}</span>
          </div>
        </div>
      )}

      <div className="rec-stage">
        <button
          type="button"
          className={recClass}
          disabled={snap.phase === 'starting'}
          aria-pressed={recordingUi}
          aria-label={recAria}
          onClick={() => void toggle()}
        >
          {snap.phase === 'idle' ? (
            <span className="rec-btn-label">Record</span>
          ) : (
            <>
              <span className="rec-dot" aria-hidden="true" />
              <span className="rec-btn-label">
                {snap.phase === 'starting' ? 'Starting…' : 'Recording'}
              </span>
              {snap.phase === 'live' && <span className="rec-btn-time">{elapsed}</span>}
            </>
          )}
        </button>
        <p className="rec-caption">{caption}</p>
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
            {liveText ? (
              liveText
            ) : (
              <span className="listen-row">
                <span className="listening-pulse">Listening…</span>
                <span className="mic-on">Mic on</span>
                <span className="mic-level" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
