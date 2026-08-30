import { useMemo, useState } from 'react'
import { db } from '../db'
import {
  dueFollowUps,
  peopleWithNumbers,
  pct,
  placeConversionNote,
  quietStretch,
  unusedNumbers,
} from '../stats'
import { toast } from '../toast'
import type { Approach } from '../types'
import {
  OUTCOME_LABEL,
  addDays,
  formatFull,
  formatShortDate,
  nowISO,
} from '../utils'

type Props = { approaches: Approach[] }

export function Next({ approaches }: Props) {
  const due = useMemo(() => dueFollowUps(approaches), [approaches])
  const unused = useMemo(() => unusedNumbers(approaches), [approaches])
  const quiet = useMemo(() => quietStretch(approaches), [approaches])
  const places = useMemo(() => placeConversionNote(approaches), [approaches])
  const people = useMemo(() => peopleWithNumbers(approaches), [approaches])
  const commitments = useMemo(() => {
    const rows: { id: string; who: string; place: string; text: string }[] = []
    for (const a of approaches) {
      for (const c of a.analysis?.commitments ?? []) {
        rows.push({ id: `${a.id}:${c}`, who: a.who, place: a.place, text: c })
      }
    }
    return rows.slice(0, 12)
  }, [approaches])

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Open loops</p>
        <h1>Next</h1>
      </header>

      {due.length === 0 && unused.length === 0 && !quiet && !places && people.length === 0 && commitments.length === 0 && (
        <div className="empty">
          <p className="empty-title">Nothing waiting</p>
          <p>Follow-ups from recorded conversations will show up here.</p>
        </div>
      )}

      {due.length > 0 && (
        <>
          <p className="section-title">Due</p>
          {due.map((row) => (
            <FollowCard key={row.id} row={row} />
          ))}
        </>
      )}

      {(unused.length > 0 || quiet || places) && <p className="section-title">Suggestions</p>}

      {unused.map((row) => (
        <article key={`u-${row.id}`} className="suggest">
          <p className="card-title">{row.who.trim() || 'Unknown'}</p>
          <p className="card-meta">
            Number from {row.place}
            <span className="dot">·</span>
            {formatShortDate(row.at)}
            {row.followUpDone ? null : ' — no follow-up yet'}
          </p>
        </article>
      ))}

      {quiet && (
        <article className="suggest">
          <p className="card-title">Quiet stretch</p>
          <p>
            No approaches in {quiet.days} day{quiet.days === 1 ? '' : 's'}. Last one was{' '}
            {quiet.weekday}.
          </p>
        </article>
      )}

      {places && (
        <article className="suggest">
          <p className="card-title">Place conversion</p>
          <p>
            {places.better} converts better than {places.worse} ({pct(places.betterRate)} vs{' '}
            {pct(places.worseRate)}).
          </p>
        </article>
      )}

      {commitments.length > 0 && (
        <>
          <p className="section-title">From transcripts</p>
          {commitments.map((c) => (
            <article key={c.id} className="suggest">
              <p className="card-title">{c.who.trim() || c.place || 'Conversation'}</p>
              <p>{c.text}</p>
            </article>
          ))}
        </>
      )}

      {people.length > 0 && (
        <>
          <p className="section-title">People with a number</p>
          {people.map((p) => (
            <article key={p.who} className="card">
              <p className="card-title">{p.who}</p>
              <p className="card-meta">Last contact {formatShortDate(p.lastAt)}</p>
              <p>{p.nextStep}</p>
            </article>
          ))}
        </>
      )}
    </div>
  )
}

function FollowCard({ row }: { row: Approach }) {
  const [note, setNote] = useState('')

  async function markDone() {
    await db.approaches.update(row.id, { followUpDone: true, updatedAt: nowISO() })
    toast('Marked done')
  }

  async function snooze() {
    const from = row.followUpAt ? new Date(row.followUpAt) : new Date()
    const next = addDays(from, 1)
    await db.approaches.update(row.id, { followUpAt: next.toISOString(), updatedAt: nowISO() })
    toast('Snoozed a day')
  }

  async function appendNote() {
    const text = note.trim()
    if (!text) return
    const line = `${formatFull(nowISO())}: ${text}`
    const notes = row.notes ? `${row.notes}\n${line}` : line
    await db.approaches.update(row.id, { notes, updatedAt: nowISO() })
    setNote('')
    toast('Note added')
  }

  return (
    <article className="card">
      <p className="card-title">{row.who.trim() || 'Unknown'}</p>
      <p className="card-meta">
        {row.place}
        <span className="dot">·</span>
        {OUTCOME_LABEL[row.outcome]}
        <span className="dot">·</span>
        due {row.followUpAt ? formatShortDate(row.followUpAt) : '—'}
      </p>
      <div className="card-actions">
        <button type="button" className="btn-primary" onClick={() => void markDone()}>
          Mark done
        </button>
        <button type="button" className="btn-secondary" onClick={() => void snooze()}>
          Snooze 1 day
        </button>
      </div>
      <div className="note-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note"
          aria-label={`Note for ${row.who.trim() || 'this follow-up'}`}
        />
        <button type="button" className="btn-secondary" onClick={() => void appendNote()}>
          Add
        </button>
      </div>
    </article>
  )
}
