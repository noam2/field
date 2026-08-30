import { useEffect, useMemo, useState } from 'react'
import { Overlay } from '../components/Overlay'
import { Segmented } from '../components/Segmented'
import { db } from '../db'
import { toast } from '../toast'
import type { Approach, Outcome } from '../types'
import {
  FEEL_LABEL,
  OUTCOME_LABEL,
  OUTCOMES,
  eventLabel,
  formatDayHeading,
  formatDuration,
  formatFull,
  formatTime,
  formatTimeRange,
  fromDateInput,
  fromDatetimeLocalValue,
  localDayKeyFromIso,
  nowISO,
  sameWho,
  snippet,
  toDateInput,
  toDatetimeLocalValue,
} from '../utils'

type Props = { approaches: Approach[] }

export function History({ approaches }: Props) {
  const [q, setQ] = useState('')
  const [outcome, setOutcome] = useState<Outcome | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return approaches.filter((a) => {
      if (outcome !== 'all' && a.outcome !== outcome) return false
      if (!needle) return true
      return [a.who, a.place, a.notes, a.opener, a.transcript, a.insight?.summary].some((s) =>
        (s ?? '').toLowerCase().includes(needle),
      )
    })
  }, [approaches, q, outcome])

  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.at < b.at ? 1 : -1))
    const map = new Map<string, Approach[]>()
    for (const a of sorted) {
      const key = localDayKeyFromIso(a.at)
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      heading: formatDayHeading(rows[0].at),
      rows,
    }))
  }, [filtered])

  const selected = approaches.find((a) => a.id === selectedId) ?? null
  const thread = useMemo(() => {
    if (!selected || !selected.who.trim()) return []
    return approaches.filter((a) => sameWho(a, selected.who)).sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [approaches, selected])

  function closeDetail() {
    setSelectedId(null)
    setEditing(false)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Archive</p>
        <h1>History</h1>
      </header>

      <input
        className="hist-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search transcript, place, notes…"
        aria-label="Search history"
      />

      <div className="hist-filters" role="toolbar" aria-label="Outcome filter">
        <button
          type="button"
          className={outcome === 'all' ? 'hist-filter is-on' : 'hist-filter'}
          onClick={() => setOutcome('all')}
        >
          All
        </button>
        {OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            className={outcome === o ? 'hist-filter is-on' : 'hist-filter'}
            onClick={() => setOutcome(o)}
          >
            {OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>

      {approaches.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Nothing logged yet</p>
          <p>Start a session from Log — conversations are recorded automatically.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No matches</p>
          <p>Try a different name, place, or outcome.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="hist-group">
            <p className="hist-day">{g.heading}</p>
            {g.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="hist-row"
                onClick={() => {
                  setSelectedId(row.id)
                  setEditing(false)
                }}
              >
                <span className="hist-who">{row.who.trim() || row.place || 'Conversation'}</span>
                <span className="muted">{formatTime(row.at)}</span>
                <span className="hist-place">
                  {eventLabel(row)}
                  <span className="dot">·</span>
                  {formatDuration(row.dwellSeconds)}
                  <span className="dot">·</span>
                  {row.place}
                  {row.analysisSource === 'pending' ? (
                    <>
                      <span className="dot">·</span>
                      <span className="pending-label">Understanding…</span>
                    </>
                  ) : row.insight?.summary ? (
                    <>
                      <span className="dot">·</span>
                      {snippet(row.insight.summary)}
                    </>
                  ) : row.transcript ? (
                    <>
                      <span className="dot">·</span>
                      {snippet(row.transcript)}
                    </>
                  ) : null}
                </span>
              </button>
            ))}
          </section>
        ))
      )}

      {selected && (
        <Overlay title={editing ? 'Edit' : eventLabel(selected)} onClose={closeDetail}>
          {editing ? (
            <EditForm row={selected} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
          ) : (
            <Detail
              row={selected}
              thread={thread}
              onEdit={() => setEditing(true)}
              onDeleted={closeDetail}
              onOpen={(id) => {
                setSelectedId(id)
                setEditing(false)
              }}
            />
          )}
        </Overlay>
      )}
    </div>
  )
}

function AudioPlay({ audioId }: { audioId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    let cancelled = false
    void db.audioClips.get(audioId).then((clip) => {
      if (!clip || cancelled) return
      u = URL.createObjectURL(clip.blob)
      setUrl(u)
    })
    return () => {
      cancelled = true
      if (u) URL.revokeObjectURL(u)
    }
  }, [audioId])
  if (!url) return <p className="muted">Loading audio…</p>
  return <audio className="audio-player" controls src={url} preload="metadata" />
}

function Detail({
  row,
  thread,
  onEdit,
  onDeleted,
  onOpen,
}: {
  row: Approach
  thread: Approach[]
  onEdit: () => void
  onDeleted: () => void
  onOpen: (id: string) => void
}) {
  const [confirm, setConfirm] = useState(false)

  async function remove() {
    if (row.audioId) await db.audioClips.delete(row.audioId)
    await db.approaches.delete(row.id)
    toast('Deleted')
    onDeleted()
  }

  return (
    <>
      <dl className="detail-dl">
        <dt>When</dt>
        <dd>{formatTimeRange(row.at, row.endedAt, row.dwellSeconds)}</dd>
        <dt>Duration</dt>
        <dd>{formatDuration(row.dwellSeconds)}</dd>
        <dt>Place</dt>
        <dd>{row.place}</dd>
        {row.lat != null && row.lng != null && (
          <>
            <dt>Coords</dt>
            <dd>
              {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
              {row.accuracy != null ? ` · ±${Math.round(row.accuracy)}m` : ''}
            </dd>
          </>
        )}
        <dt>Who</dt>
        <dd>{row.who.trim() || '—'}</dd>
        <dt>Outcome</dt>
        <dd>{eventLabel(row)}</dd>
        <dt>Feel</dt>
        <dd>{row.feel ? FEEL_LABEL[row.feel] : '—'}</dd>
      </dl>

      {row.analysisSource === 'pending' && <p className="pending-label">Understanding…</p>}

      {row.insight && (
        <>
          <div className="chip-row">
            <span className={`sent-chip sent-${row.insight.sentiment}`}>{row.insight.sentiment}</span>
            <span className={row.insight.success ? 'sent-chip sent-positive' : 'sent-chip sent-negative'}>
              {row.insight.success ? 'success' : 'no success'}
            </span>
            {row.analysisSource === 'rules' && <span className="sent-chip">rules fallback</span>}
          </div>
          <p>{row.insight.summary}</p>
          {row.insight.topics.length > 0 && (
            <p className="muted">Topics: {row.insight.topics.join(', ')}</p>
          )}
          {row.insight.commitments.length > 0 && (
            <>
              <p className="section-title">Commitments</p>
              <ul className="commit-list">
                {row.insight.commitments.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {row.insight.objections.length > 0 && (
            <>
              <p className="section-title">Objections</p>
              <ul className="commit-list">
                {row.insight.objections.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {row.insight.followUpSuggestion && (
            <>
              <p className="section-title">Follow-up</p>
              <p>{row.insight.followUpSuggestion}</p>
            </>
          )}
        </>
      )}

      {row.audioId && (
        <>
          <p className="section-title">Audio</p>
          <AudioPlay audioId={row.audioId} />
        </>
      )}

      {row.transcript.trim() ? (
        <>
          <p className="section-title">Transcript</p>
          <p className="transcript-full">{row.transcript}</p>
        </>
      ) : null}

      {!row.insight && row.analysis?.commitments && row.analysis.commitments.length > 0 && (
        <>
          <p className="section-title">Commitments</p>
          <ul className="commit-list">
            {row.analysis.commitments.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {!row.insight && row.analysis?.topics && row.analysis.topics.length > 0 && (
        <p className="muted">Topics: {row.analysis.topics.join(', ')}</p>
      )}

      {row.notes.trim() && !row.transcript.trim() && (
        <>
          <p className="section-title">Notes</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{row.notes}</p>
        </>
      )}

      <div className="card-actions">
        <button type="button" className="btn-secondary" onClick={onEdit}>
          Edit
        </button>
        {!confirm ? (
          <button type="button" className="btn-danger" onClick={() => setConfirm(true)}>
            Delete
          </button>
        ) : (
          <>
            <button type="button" className="btn-danger" onClick={() => void remove()}>
              Confirm delete
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        )}
      </div>

      {thread.length > 1 && (
        <>
          <p className="section-title">Thread</p>
          <div className="thread">
            {thread.map((a) => (
              <button
                key={a.id}
                type="button"
                className="hist-row"
                onClick={() => onOpen(a.id)}
                aria-current={a.id === row.id ? 'true' : undefined}
              >
                <span className="hist-who">{eventLabel(a)}</span>
                <span className="muted">{formatTime(a.at)}</span>
                <span className="hist-place">
                  {a.place}
                  <span className="dot">·</span>
                  {formatFull(a.at)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function EditForm({
  row,
  onCancel,
  onSaved,
}: {
  row: Approach
  onCancel: () => void
  onSaved: () => void
}) {
  const [atLocal, setAtLocal] = useState(() => toDatetimeLocalValue(new Date(row.at)))
  const [place, setPlace] = useState(row.place)
  const [who, setWho] = useState(row.who)
  const [opener, setOpener] = useState(row.opener)
  const [notes, setNotes] = useState(row.notes)
  const [outcome, setOutcome] = useState<Outcome>(row.outcome)
  const [followUp, setFollowUp] = useState(Boolean(row.followUpAt))
  const [followUpDate, setFollowUpDate] = useState(() => toDateInput(row.followUpAt ?? nowISO()))
  const [followUpDone, setFollowUpDone] = useState(row.followUpDone)

  async function save() {
    if (!place.trim()) return
    const next: Approach = {
      ...row,
      at: fromDatetimeLocalValue(atLocal),
      place: place.trim(),
      who: who.trim(),
      opener: opener.trim(),
      notes: notes.trim(),
      outcome,
      feel: row.feel,
      followUpAt: followUp ? fromDateInput(followUpDate) : null,
      followUpDone: followUp ? followUpDone : false,
      updatedAt: nowISO(),
    }
    await db.approaches.put(next)
    toast('Updated')
    onSaved()
  }

  return (
    <form
      className="edit-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className="field">
        <span className="label">When</span>
        <input type="datetime-local" value={atLocal} onChange={(e) => setAtLocal(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Place</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} required />
      </label>
      <label className="field">
        <span className="label">Who</span>
        <input value={who} onChange={(e) => setWho(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Opener</span>
        <input value={opener} onChange={(e) => setOpener(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Segmented
        name="edit-outcome"
        legend="Outcome"
        value={outcome}
        onChange={setOutcome}
        options={OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))}
      />
      <label className="toggle">
        <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
        <span>Follow up</span>
      </label>
      {followUp && (
        <>
          <label className="field">
            <span className="label">Due</span>
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={followUpDone} onChange={(e) => setFollowUpDone(e.target.checked)} />
            <span>Done</span>
          </label>
        </>
      )}
      <button type="submit" className="btn-primary" disabled={!place.trim()}>
        Save changes
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}
