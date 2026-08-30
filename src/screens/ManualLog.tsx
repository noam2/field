import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Segmented } from '../components/Segmented'
import { db, getLastPlace, setLastPlace } from '../db'
import { toast } from '../toast'
import type { Feel, Outcome } from '../types'
import {
  FEEL_LABEL,
  OUTCOME_LABEL,
  OUTCOMES,
  fromDateInput,
  fromDatetimeLocalValue,
  nowISO,
  recentPlaces,
  toDateInput,
  toDatetimeLocalValue,
  tomorrowMorningISO,
} from '../utils'

type Props = { onSaved?: () => void; onCancel?: () => void }

export function ManualLog({ onSaved, onCancel }: Props) {
  const approaches = useLiveQuery(() => db.approaches.orderBy('at').reverse().toArray()) ?? []
  const [atLocal, setAtLocal] = useState(() => toDatetimeLocalValue(new Date()))
  const [place, setPlace] = useState(() => getLastPlace())
  const [who, setWho] = useState('')
  const [opener, setOpener] = useState('')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [feel, setFeel] = useState<Feel | null>(null)
  const [followUp, setFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState(() => toDateInput(tomorrowMorningISO()))
  const [followTouched, setFollowTouched] = useState(false)

  const places = useMemo(() => recentPlaces(approaches), [approaches])
  const canSave = place.trim().length > 0 && outcome !== null

  function handleOutcome(next: Outcome) {
    setOutcome(next)
    if (next === 'number' && !followTouched) {
      setFollowUp(true)
      setFollowUpDate(toDateInput(tomorrowMorningISO()))
    }
  }

  async function save() {
    if (!outcome || !place.trim()) return
    const now = nowISO()
    await db.approaches.add({
      id: crypto.randomUUID(),
      at: fromDatetimeLocalValue(atLocal),
      place: place.trim(),
      who: who.trim(),
      opener: opener.trim(),
      notes: notes.trim(),
      outcome,
      feel,
      followUpAt: followUp ? fromDateInput(followUpDate) : null,
      followUpDone: false,
      createdAt: now,
      updatedAt: now,
      source: 'manual',
      lat: null,
      lng: null,
      accuracy: null,
      dwellSeconds: null,
      sessionId: null,
      endedAt: null,
      transcript: '',
      analysis: null,
      audioId: null,
      analysisSource: 'rules',
      insight: null,
    })
    setLastPlace(place.trim())
    toast('Saved')
    onSaved?.()
  }

  return (
    <form
      className="log-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <p className="muted">Emergency / leftover manual row. Prefer a recorded session.</p>
      <label className="field">
        <span className="label">When</span>
        <input type="datetime-local" value={atLocal} onChange={(e) => setAtLocal(e.target.value)} required />
      </label>
      <label className="field">
        <span className="label">Place</span>
        <input
          id="place"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Café, park, station…"
          autoComplete="off"
        />
        {places.length > 0 && (
          <div className="chips" role="list">
            {places.map((p) => (
              <button key={p} type="button" className={p === place ? 'chip is-on' : 'chip'} onClick={() => setPlace(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </label>
      <label className="field">
        <span className="label">
          Who <span className="opt">optional</span>
        </span>
        <input value={who} onChange={(e) => setWho(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span className="label">
          Opener <span className="opt">optional</span>
        </span>
        <input value={opener} onChange={(e) => setOpener(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span className="label">
          Notes <span className="opt">optional</span>
        </span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Segmented
        name="outcome"
        legend="Outcome"
        value={outcome}
        onChange={handleOutcome}
        options={OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))}
      />
      <fieldset className="field">
        <legend className="label">
          How it felt <span className="opt">optional</span>
        </legend>
        <div className="feel-row" role="radiogroup" aria-label="How it felt">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={feel === n ? 'feel is-on' : 'feel'}
              aria-pressed={feel === n}
              onClick={() => setFeel(feel === n ? null : n)}
            >
              <span className="feel-n">{n}</span>
              {FEEL_LABEL[n]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="toggle">
        <input
          type="checkbox"
          checked={followUp}
          onChange={(e) => {
            setFollowTouched(true)
            setFollowUp(e.target.checked)
          }}
        />
        <span>Follow up</span>
      </label>
      {followUp && (
        <label className="field">
          <span className="label">Due</span>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </label>
      )}
      <button type="submit" className="btn-primary" disabled={!canSave}>
        Save approach
      </button>
      {onCancel && (
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  )
}
