import { useMemo } from 'react'
import {
  hourStats,
  meanValenceByPlace,
  pct,
  recordingStats,
  recordingsOnly,
  successByPlace,
  weekCounts,
  weekdayStats,
} from '../stats'
import type { Approach } from '../types'
import { computeStreak, daysSinceLast, formatDuration } from '../utils'

type Props = { approaches: Approach[]; onLog: () => void }

export function Stats({ approaches, onLog }: Props) {
  const recs = useMemo(() => recordingsOnly(approaches), [approaches])
  const rec = useMemo(() => recordingStats(approaches), [approaches])
  const weeks = useMemo(() => weekCounts(recs), [recs])
  const hours = useMemo(() => hourStats(recs), [recs])
  const days = useMemo(() => weekdayStats(recs), [recs])
  const places = useMemo(() => successByPlace(recs, 2), [recs])
  const valencePlaces = useMemo(() => meanValenceByPlace(recs, 2), [recs])
  const streak = useMemo(() => computeStreak(recs), [recs])
  const since = useMemo(() => daysSinceLast(recs), [recs])

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

  const weekMax = Math.max(weeks.thisWeek, weeks.lastWeek, 1)
  const hourMax = Math.max(...hours.map((h) => h.rate), 0.01)
  const dayMax = Math.max(...days.map((d) => d.rate), 0.01)
  const placeMax = Math.max(...places.map((p) => p.rate), 0.01)
  const topicMax = Math.max(...rec.topics.map((t) => t.count), 1)
  const valMax = Math.max(...valencePlaces.map((p) => Math.abs(p.valence)), 0.01)

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Pattern</p>
        <h1>Stats</h1>
      </header>

      <div className="stat-grid">
        <div className="stat-tile">
          <p className="muted">Conversations</p>
          <p className="stat-n">{rec.conversations}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Success rate</p>
          <p className="stat-n">{pct(rec.successRate)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Talk time</p>
          <p className="stat-n">{formatDuration(rec.talkTimeSeconds)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Contact rate</p>
          <p className="stat-n">{pct(rec.contactRate)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Schedule rate</p>
          <p className="stat-n">{pct(rec.scheduleRate)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Rejection rate</p>
          <p className="stat-n">{pct(rec.rejectionRate)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Questions / talk</p>
          <p className="stat-n">{rec.questionRate.toFixed(1)}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">This week</p>
          <p className="stat-n">{weeks.thisWeek}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Last week</p>
          <p className="stat-n">{weeks.lastWeek}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Streak</p>
          <p className="stat-n">{streak}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Days since last</p>
          <p className="stat-n">{since ?? '—'}</p>
        </div>
      </div>

      <p className="section-title">Sentiment</p>
      <div className="stat-grid">
        <div className="stat-tile">
          <p className="muted">Positive</p>
          <p className="stat-n">{rec.sentiment.positive}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Negative</p>
          <p className="stat-n">{rec.sentiment.negative}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Mixed</p>
          <p className="stat-n">{rec.sentiment.mixed}</p>
        </div>
        <div className="stat-tile">
          <p className="muted">Neutral</p>
          <p className="stat-n">{rec.sentiment.neutral}</p>
        </div>
      </div>

      <svg className="week-svg" viewBox="0 0 100 56" role="img" aria-label="This week versus last week">
        <rect
          x="12"
          y={8 + (40 - (weeks.thisWeek / weekMax) * 40)}
          width="28"
          height={(weeks.thisWeek / weekMax) * 40}
          rx="4"
          fill="#d4a853"
        />
        <rect
          x="60"
          y={8 + (40 - (weeks.lastWeek / weekMax) * 40)}
          width="28"
          height={(weeks.lastWeek / weekMax) * 40}
          rx="4"
          fill="#9a958c"
        />
        <text x="26" y="54" textAnchor="middle" fill="#9a958c" fontSize="8">
          This
        </text>
        <text x="74" y="54" textAnchor="middle" fill="#9a958c" fontSize="8">
          Last
        </text>
      </svg>

      {rec.topics.length > 0 && (
        <>
          <p className="section-title">Top topics</p>
          {rec.topics.map((row) => (
            <Bar key={row.topic} label={row.topic} value={row.count} max={topicMax} />
          ))}
        </>
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

      <p className="section-title">Success by place</p>
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

      <p className="section-title">Mean valence by place</p>
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
  const width = max === 0 ? 0 : Math.max(4, Math.round((value / max) * 100))
  return (
    <div className="bar-row">
      <div className="bar-meta">
        <span>{label}</span>
        <span className="bar-val">{hint ?? value}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
