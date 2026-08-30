import type { AnalysisSource, Approach, ApproachSource, Feel, Insight, Outcome, Session, TranscriptAnalysis } from './types'
import { parseInsightJson } from './understand'

export const OUTCOMES: Outcome[] = ['talked', 'number', 'chat', 'date', 'no', 'other']

export const OUTCOME_LABEL: Record<Outcome, string> = {
  talked: 'Talked',
  number: 'Number',
  chat: 'Chat',
  date: 'Date',
  no: 'No',
  other: 'Other',
}

export const FEEL_LABEL: Record<Feel, string> = {
  1: 'Off',
  2: 'Fine',
  3: 'Good',
}

const pad = (n: number) => String(n).padStart(2, '0')

export function nowISO(): string {
  return new Date().toISOString()
}

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function localDayKeyFromIso(iso: string): string {
  return localDayKey(new Date(iso))
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfLocalDay(d)
  const day = x.getDay()
  const diff = day === 0 ? 6 : day - 1
  x.setDate(x.getDate() - diff)
  return x
}

export function toDatetimeLocalValue(d: Date): string {
  return `${localDayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

export function toDateInput(iso: string): string {
  return localDayKeyFromIso(iso)
}

export function fromDateInput(value: string, hours = 9, minutes = 0): string {
  const [y, m, day] = value.split('-').map(Number)
  return new Date(y, m - 1, day, hours, minutes, 0, 0).toISOString()
}

export function tomorrowMorningISO(): string {
  const d = addDays(new Date(), 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export function formatDayHeading(iso: string): string {
  const d = startOfLocalDay(new Date(iso))
  const today = startOfLocalDay(new Date())
  const yest = addDays(today, -1)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === yest.getTime()) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function weekdayName(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

export function isConverted(outcome: Outcome): boolean {
  return outcome === 'number' || outcome === 'date'
}

export function normalizeWho(who: string): string {
  return who.trim().toLowerCase()
}

export function isFollowUpDue(followUpAt: string, now = new Date()): boolean {
  return startOfLocalDay(new Date(followUpAt)).getTime() <= startOfLocalDay(now).getTime()
}

export function computeStreak(approaches: Approach[]): number {
  if (approaches.length === 0) return 0
  const days = new Set(approaches.map((a) => localDayKeyFromIso(a.at)))
  let cursor = startOfLocalDay(new Date())
  if (!days.has(localDayKey(cursor))) {
    cursor = addDays(cursor, -1)
    if (!days.has(localDayKey(cursor))) return 0
  }
  let n = 0
  while (days.has(localDayKey(cursor))) {
    n += 1
    cursor = addDays(cursor, -1)
  }
  return n
}

export function daysSinceLast(approaches: Approach[]): number | null {
  if (approaches.length === 0) return null
  let latest = approaches[0].at
  for (const a of approaches) {
    if (a.at > latest) latest = a.at
  }
  const lastDay = startOfLocalDay(new Date(latest)).getTime()
  const today = startOfLocalDay(new Date()).getTime()
  return Math.round((today - lastDay) / 86_400_000)
}

export function recentPlaces(approaches: Approach[], limit = 8): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const sorted = [...approaches].sort((a, b) => (a.at < b.at ? 1 : -1))
  for (const a of sorted) {
    const p = a.place.trim()
    if (!p) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= limit) break
  }
  return out
}

export function sameWho(a: Approach, who: string): boolean {
  const n = normalizeWho(who)
  if (!n) return false
  return normalizeWho(a.who) === n
}

export function hourLabel(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric' })
}

export function weekdayShort(index: number): string {
  // 0 = Monday
  const monday = startOfWeekMonday(new Date())
  const d = addDays(monday, index)
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

export function formatCoordPlace(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lng).toFixed(3)}° ${ew}`
}

export function isAuto(a: { source?: ApproachSource }): boolean {
  return a.source === 'auto'
}

export function eventLabel(a: Approach): string {
  if (a.source === 'auto') return 'Dwell'
  return OUTCOME_LABEL[a.outcome]
}

export function snippet(text: string, max = 90): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1).trimEnd()}…`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return sec ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export function formatTimeRange(startIso: string, endIso: string | null, dwellSeconds: number | null): string {
  const start = formatTime(startIso)
  const endMs = endIso
    ? new Date(endIso).getTime()
    : new Date(startIso).getTime() + (dwellSeconds ?? 0) * 1000
  const end = formatTime(new Date(endMs).toISOString())
  return `${start}–${end}`
}

function coerceAnalysis(value: unknown): TranscriptAnalysis | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const outcomes: string[] = ['number', 'chat', 'date', 'talked', 'no', 'other']
  if (typeof v.wordCount !== 'number' || typeof v.questionCount !== 'number') return null
  if (typeof v.exchangedContact !== 'boolean' || typeof v.scheduled !== 'boolean') return null
  if (!Array.isArray(v.commitments) || !Array.isArray(v.topics)) return null
  if (typeof v.outcome !== 'string' || !outcomes.includes(v.outcome)) return null
  if (!(v.followUpAt === null || typeof v.followUpAt === 'string')) return null
  if (typeof v.summary !== 'string') return null
  return {
    wordCount: v.wordCount,
    questionCount: v.questionCount,
    exchangedContact: v.exchangedContact,
    scheduled: v.scheduled,
    commitments: v.commitments.filter((x): x is string => typeof x === 'string'),
    topics: v.topics.filter((x): x is string => typeof x === 'string'),
    outcome: v.outcome as Outcome,
    followUpAt: v.followUpAt as string | null,
    summary: v.summary,
  }
}

export function coerceApproach(value: unknown): Approach | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const outcomes: string[] = ['number', 'chat', 'date', 'talked', 'no', 'other']
  if (
    typeof v.id !== 'string' ||
    typeof v.at !== 'string' ||
    typeof v.place !== 'string' ||
    typeof v.who !== 'string' ||
    typeof v.opener !== 'string' ||
    typeof v.notes !== 'string' ||
    typeof v.outcome !== 'string' ||
    !outcomes.includes(v.outcome) ||
    !(v.feel === null || v.feel === 1 || v.feel === 2 || v.feel === 3) ||
    !(v.followUpAt === null || typeof v.followUpAt === 'string') ||
    typeof v.followUpDone !== 'boolean' ||
    typeof v.createdAt !== 'string' ||
    typeof v.updatedAt !== 'string'
  ) {
    return null
  }
  const source: ApproachSource =
    v.source === 'auto' || v.source === 'recording' || v.source === 'manual' ? v.source : 'manual'
  const analysis = coerceAnalysis(v.analysis)
  const insight: Insight | null = parseInsightJson(v.insight)
  const analysisSource: AnalysisSource =
    v.analysisSource === 'model' || v.analysisSource === 'pending' || v.analysisSource === 'rules'
      ? v.analysisSource
      : insight
        ? 'model'
        : 'rules'
  return {
    id: v.id,
    at: v.at,
    place: v.place,
    who: v.who,
    opener: v.opener,
    notes: v.notes,
    outcome: v.outcome as Outcome,
    feel: v.feel as Feel | null,
    followUpAt: v.followUpAt as string | null,
    followUpDone: v.followUpDone,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    source,
    lat: typeof v.lat === 'number' ? v.lat : null,
    lng: typeof v.lng === 'number' ? v.lng : null,
    accuracy: typeof v.accuracy === 'number' ? v.accuracy : null,
    dwellSeconds: typeof v.dwellSeconds === 'number' ? v.dwellSeconds : null,
    sessionId: typeof v.sessionId === 'string' ? v.sessionId : null,
    endedAt: typeof v.endedAt === 'string' ? v.endedAt : null,
    transcript: typeof v.transcript === 'string' ? v.transcript : '',
    analysis,
    audioId: typeof v.audioId === 'string' ? v.audioId : null,
    analysisSource,
    insight,
  }
}

export function isApproach(value: unknown): value is Approach {
  return coerceApproach(value) !== null
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.startedAt === 'string' &&
    (v.endedAt === null || typeof v.endedAt === 'string')
  )
}
