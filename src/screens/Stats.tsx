import { useMemo } from 'react'
import {
  hourStats,
  pct,
  rankPlaces,
  recordingStats,
  recordingsOnly,
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
  const places = useMemo(() => rankPlaces(recs, 1), [recs])
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
  const hourMax = Math.max(...hours.map((h) => h.count), 1)
  const dayMax = Math.max(...days.map((d) => d.count), 1)
  const placeMax = Math.max(...places.map((p) => p.count), 1)
  const topicMax = Math.max(...rec.topics.map((t) => t.count), 1)

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

      <p className="section-title">Best hours</p>
      {hours.slice(0, 6).map((row) => (
        <Bar key={row.label} label={row.label} value={row.count} max={hourMax} hint={`${row.count}`} />
      ))}

      <p className="section-title">Weekdays</p>
      {days.map((row) => (
        <Bar key={row.label} label={row.label} value={row.count} max={dayMax} hint={`${row.count}`} />
      ))}

      <p className="section-title">Places</p>
      {places.slice(0, 8).map((row) => (
        <Bar
          key={row.place}
          label={row.place}
          value={row.count}
          max={placeMax}
          hint={`${row.count} · ${pct(row.rate)}`}
        />
      ))}
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
