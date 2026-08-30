import { useMemo } from 'react'
import { briefing } from '../briefing'
import {
  approachSuccess,
  hourStats,
  languageCounts,
  meanValenceByPlace,
  pct,
  recordingStats,
  recordingsOnly,
  successByDaypart,
  successByPlace,
  successByPlaceType,
  weekCounts,
  weekdayStats,
} from '../stats'
import type { Approach, Sentiment } from '../types'
import { computeStreak, formatDuration } from '../utils'

type Props = { approaches: Approach[]; onLog: () => void }

const SENTIMENT_ORDER: Sentiment[] = ['positive', 'mixed', 'negative', 'neutral']
const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: 'Positive',
  mixed: 'Mixed',
  negative: 'Negative',
  neutral: 'Neutral',
}

export function Stats({ approaches, onLog }: Props) {
  const recs = useMemo(() => recordingsOnly(approaches), [approaches])
  const rec = useMemo(() => recordingStats(approaches), [approaches])
  const brief = useMemo(() => briefing(approaches), [approaches])
  const weeks = useMemo(() => weekCounts(recs), [recs])
  const hours = useMemo(() => hourStats(recs), [recs])
  const days = useMemo(() => weekdayStats(recs), [recs])
  const dayparts = useMemo(() => successByDaypart(recs), [recs])
  const placeTypes = useMemo(() => successByPlaceType(recs, 1), [recs])
  const langs = useMemo(() => languageCounts(recs), [recs])
  const places = useMemo(() => successByPlace(recs, 2), [recs])
  const valencePlaces = useMemo(() => meanValenceByPlace(recs, 2), [recs])
  const streak = useMemo(() => computeStreak(recs), [recs])
  const wins = useMemo(() => recs.filter(approachSuccess).length, [recs])

  if (recs.length === 0) {
    return (
      <div className="screen">
        <header className="screen-head">
          <p className="eyebrow">Pattern</p>
          <h1>Stats</h1>
        </header>
        <div className="empty">
          <p className="empty-title">No recordings yet</p>
          <p>Start a session. Stats come from recorded conversations, not leftover manual rows.</p>
          <button type="button" className="btn-primary" onClick={onLog}>
            Start a session
          </button>
        </div>
      </div>
    )
  }

  const daypartMax = Math.max(...dayparts.map((d) => d.rate), 0.01)
  const typeMax = Math.max(...placeTypes.map((d) => d.rate), 0.01)
  const hourMax = Math.max(...hours.map((h) => h.rate), 0.01)
  const dayMax = Math.max(...days.map((d) => d.rate), 0.01)
  const placeMax = Math.max(...places.map((p) => p.rate), 0.01)
  const topicMax = Math.max(...rec.topics.map((t) => t.count), 1)
  const valMax = Math.max(...valencePlaces.map((p) => Math.abs(p.valence)), 0.01)
  const sentTotal = SENTIMENT_ORDER.reduce((s, k) => s + rec.sentiment[k], 0) || 1

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Pattern</p>
        <h1>Stats</h1>
      </header>

      <div className="hero-stat">
        <p className="hero-pct">{pct(rec.successRate)}</p>
        <p className="hero-n">
          {wins} of {rec.conversations}
        </p>
        <p className="hero-week">
          This week {weeks.thisWeek} · last week {weeks.lastWeek}
        </p>
        {brief && (
          <div className="briefing-card">
            <p className="briefing-headline">{brief.headline}</p>
            {brief.detail ? <p className="briefing-detail">{brief.detail}</p> : null}
          </div>
        )}
      </div>

      <div className="stat-grid is-compact">
        <CompactTile label="Contact" value={pct(rec.contactRate)} />
        <CompactTile label="Schedule" value={pct(rec.scheduleRate)} />
        <CompactTile label="Rejection" value={pct(rec.rejectionRate)} />
        <CompactTile label="Talk time" value={formatDuration(rec.talkTimeSeconds)} />
        <CompactTile label="This week" value={String(weeks.thisWeek)} />
        <CompactTile label="Streak" value={String(streak)} />
      </div>

      <p className="section-title">Sentiment</p>
      <div className="stack-bar" role="img" aria-label="Sentiment mix">
        {SENTIMENT_ORDER.map((key) => {
          const n = rec.sentiment[key]
          if (n === 0) return null
          return (
            <div
              key={key}
              className={`stack-seg stack-${key}`}
              style={{ flexGrow: n, flexBasis: 0 }}
              title={`${SENTIMENT_LABEL[key]} ${n}`}
            />
          )
        })}
      </div>
      <p className="stack-legend">
        {SENTIMENT_ORDER.filter((k) => rec.sentiment[k] > 0).map((key) => (
          <span key={key}>
            {SENTIMENT_LABEL[key]} {rec.sentiment[key]}
            <span className="muted"> · {pct(rec.sentiment[key] / sentTotal)}</span>
          </span>
        ))}
      </p>

      <p className="section-title">Success by time of day</p>
      {dayparts.length === 0 ? (
        <p className="muted">No time-of-day data yet.</p>
      ) : (
        dayparts.map((row) => (
          <Bar key={row.label} label={row.label} value={row.rate} max={daypartMax} hint={`${pct(row.rate)} · ${row.count}`} />
        ))
      )}

      <p className="section-title">Success by place type</p>
      {placeTypes.length === 0 ? (
        <p className="muted">No place-type data yet.</p>
      ) : (
        placeTypes.map((row) => (
          <Bar key={row.label} label={row.label} value={row.rate} max={typeMax} hint={`${pct(row.rate)} · ${row.count}`} />
        ))
      )}

      <p className="section-title">Success by hour</p>
      {hours.length === 0 ? (
        <p className="muted">No hour data yet.</p>
      ) : (
        hours.map((row) => (
          <Bar key={row.label} label={row.label} value={row.rate} max={hourMax} hint={`${pct(row.rate)} · ${row.count}`} />
        ))
      )}

      <p className="section-title">Success by weekday</p>
      {days.length === 0 ? (
        <p className="muted">No weekday data yet.</p>
      ) : (
        days.map((row) => (
          <Bar key={row.label} label={row.label} value={row.rate} max={dayMax} hint={`${pct(row.rate)} · ${row.count}`} />
        ))
      )}

      <p className="section-title">Named places</p>
      {places.length === 0 ? (
        <p className="muted">Need at least two conversations at a place.</p>
      ) : (
        places.slice(0, 8).map((row) => (
          <Bar
            key={row.place}
            label={row.place}
            value={row.rate}
            max={placeMax}
            hint={`${pct(row.rate)} · ${row.count}`}
          />
        ))
      )}

      <p className="section-title">Valence by place</p>
      {valencePlaces.length === 0 ? (
        <p className="muted">Need at least two conversations at a place.</p>
      ) : (
        valencePlaces.slice(0, 8).map((row) => (
          <Bar
            key={`v-${row.place}`}
            label={row.place}
            value={Math.abs(row.valence)}
            max={valMax}
            hint={row.valence.toFixed(2)}
          />
        ))
      )}

      {rec.topics.length > 0 && (
        <>
          <p className="section-title">Topics</p>
          {rec.topics.map((row) => (
            <Bar key={row.topic} label={row.topic} value={row.count} max={topicMax} hint={String(row.count)} />
          ))}
        </>
      )}

      {langs.known > 0 && (
        <>
          <p className="section-title">Language mix</p>
          <p className="lang-mix">
            {langs.he > 0 && <span>Hebrew {langs.he}</span>}
            {langs.en > 0 && <span>English {langs.en}</span>}
            {langs.mixed > 0 && <span>Mixed {langs.mixed}</span>}
          </p>
        </>
      )}
    </div>
  )
}

function CompactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile is-compact">
      <p className="muted">{label}</p>
      <p className="stat-n">{value}</p>
    </div>
  )
}

function Bar({
  label,
  value,
  max,
  hint,
}: {
  label: string
  value: number
  max: number
  hint?: string
}) {
  const width = max === 0 ? 0 : Math.max(6, Math.round((value / max) * 100))
  return (
    <div className="bar-row">
      <div className="bar-meta">
        <span className="bar-label">{label}</span>
        <span className="bar-val">{hint ?? value}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
