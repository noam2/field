import { useMemo, useState } from 'react'
import { db } from '../db'
import {
  approachCommitments,
  dueFollowUps,
  modelFollowUps,
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
  const dueIds = useMemo(() => new Set(due.map((d) => d.id)), [due])
  const unused = useMemo(
    () => unusedNumbers(approaches).filter((row) => !dueIds.has(row.id)),
    [approaches, dueIds],
  )
  const quiet = useMemo(() => quietStretch(approaches), [approaches])
  const places = useMemo(() => placeConversionNote(approaches), [approaches])
  const people = useMemo(() => peopleWithNumbers(approaches), [approaches])
  const suggestions = useMemo(
    () => modelFollowUps(approaches).filter((s) => !dueIds.has(s.id)),
    [approaches, dueIds],
  )
  const commitments = useMemo(() => {
    const rows: { id: string; who: string; place: string; text: string }[] = []
    for (const a of approaches) {
      if (dueIds.has(a.id)) continue
      const next = a.insight?.nextAction?.trim()
      for (const c of approachCommitments(a)) {
        if (next && c.toLowerCase() === next.toLowerCase()) continue
        rows.push({ id: `${a.id}:${c}`, who: a.who || a.insight?.who || '', place: a.place, text: c })
      }
    }
    return rows.slice(0, 12)
  }, [approaches, dueIds])

  const empty =
    due.length === 0 &&
    unused.length === 0 &&
    !quiet &&
    !places &&
    people.length === 0 &&
    commitments.length === 0 &&
    suggestions.length === 0

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Open loops</p>
        <h1>Next</h1>
      </header>

      {empty && (
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

      {suggestions.length > 0 && (
        <>
          <p className="section-title">Suggested</p>
          {suggestions.map((s) => (
            <SignalCard
              key={`s-${s.id}`}
              title={s.who.trim() || s.place || 'Conversation'}
              body={s.suggestion}
              meta={s.place}
            />
          ))}
        </>
      )}

      {unused.length > 0 && (
        <>
          <p className="section-title">Unused numbers</p>
          {unused.map((row) => (
            <SignalCard
              key={`u-${row.id}`}
              title={row.who.trim() || 'Unknown'}
              body={
                row.insight?.nextAction?.trim() ||
                row.insight?.followUpSuggestion?.trim() ||
                `Number from ${row.place} — no follow-up yet`
              }
              meta={`${row.place} · ${formatShortDate(row.at)}`}
            />
          ))}
        </>
      )}

      {commitments.length > 0 && (
        <>
          <p className="section-title">Commitments</p>
          {commitments.map((c) => (
            <SignalCard
              key={c.id}
              title={c.who.trim() || c.place || 'Conversation'}
              body={c.text}
              meta={c.place}
            />
          ))}
        </>
      )}

      {(quiet || places) && <p className="section-title">Patterns</p>}

      {quiet && (
        <SignalCard
          title="Quiet stretch"
          body={`No approaches in ${quiet.days} day${quiet.days === 1 ? '' : 's'}. Last one was ${quiet.weekday}.`}
        />
      )}

      {places && (
        <SignalCard
          title="Place conversion"
          body={`${places.better} converts better than ${places.worse} (${pct(places.betterRate)} vs ${pct(places.worseRate)}).`}
        />
      )}

      {people.length > 0 && (
        <>
          <p className="section-title">People with a number</p>
          {people.map((p) => (
            <SignalCard
              key={p.who}
              title={p.who}
              body={p.nextStep}
              meta={`Last contact ${formatShortDate(p.lastAt)}`}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SignalCard({
  title,
  body,
  meta,
}: {
  title: string
  body?: string
  meta?: string
}) {
  return (
    <article className="card">
      <p className="card-title" dir="auto">
        {title}
      </p>
      {body ? (
        <p className="card-next" dir="auto">
          {body}
        </p>
      ) : null}
      {meta ? <p className="card-meta">{meta}</p> : null}
    </article>
  )
}

function FollowCard({ row }: { row: Approach }) {
  const [note, setNote] = useState('')
  const action =
    row.insight?.nextAction?.trim() || row.insight?.followUpSuggestion?.trim() || ''

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
      <p className="card-title" dir="auto">
        {row.who.trim() || 'Unknown'}
      </p>
      {action ? (
        <p className="card-next" dir="auto">
          {action}
        </p>
      ) : null}
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
