import type { Approach, Outcome } from './types'
import {
  OUTCOME_LABEL,
  OUTCOMES,
  addDays,
  formatShortDate,
  isConverted,
  isFollowUpDue,
  sameWho,
  startOfWeekMonday,
  weekdayName,
  weekdayShort,
} from './utils'

export function weekCounts(
  approaches: Approach[],
  now = new Date(),
): { thisWeek: number; lastWeek: number } {
  const thisStart = startOfWeekMonday(now)
  const lastStart = addDays(thisStart, -7)
  const nextStart = addDays(thisStart, 7)
  let thisWeek = 0
  let lastWeek = 0
  for (const a of approaches) {
    const t = new Date(a.at).getTime()
    if (t >= thisStart.getTime() && t < nextStart.getTime()) thisWeek += 1
    else if (t >= lastStart.getTime() && t < thisStart.getTime()) lastWeek += 1
  }
  return { thisWeek, lastWeek }
}

export function unusedNumbers(approaches: Approach[]): Approach[] {
  return approaches.filter((a) => {
    if (a.outcome !== 'number' || a.followUpDone) return false
    const later = approaches.some((b) => b.id !== a.id && sameWho(b, a.who) && b.at > a.at)
    return !later
  })
}

export type PlaceRank = {
  place: string
  count: number
  converted: number
  rate: number
}

export function recordingsOnly(approaches: Approach[]): Approach[] {
  return approaches.filter((a) => a.source === 'recording')
}

export type RecordingStats = {
  conversations: number
  talkTimeSeconds: number
  contactRate: number
  scheduleRate: number
  questionRate: number
  topics: { topic: string; count: number }[]
}

export function recordingStats(approaches: Approach[]): RecordingStats {
  const rows = recordingsOnly(approaches)
  const n = rows.length
  const talkTimeSeconds = rows.reduce((s, a) => s + (a.dwellSeconds ?? 0), 0)
  const contacts = rows.filter((a) => a.analysis?.exchangedContact || a.outcome === 'number').length
  const scheduled = rows.filter((a) => a.analysis?.scheduled || a.outcome === 'date').length
  const questions = rows.reduce((s, a) => s + (a.analysis?.questionCount ?? 0), 0)
  const topicMap = new Map<string, number>()
  for (const a of rows) {
    for (const t of a.analysis?.topics ?? []) {
      topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
    }
  }
  const topics = [...topicMap.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
  return {
    conversations: n,
    talkTimeSeconds,
    contactRate: n === 0 ? 0 : contacts / n,
    scheduleRate: n === 0 ? 0 : scheduled / n,
    questionRate: n === 0 ? 0 : questions / n,
    topics,
  }
}

export function rankPlaces(approaches: Approach[], minCount = 3): PlaceRank[] {
  const map = new Map<string, PlaceRank & { eligible: number }>()
  for (const a of approaches) {
    const key = a.place.trim().toLowerCase()
    if (!key) continue
    const cur = map.get(key) ?? { place: a.place.trim(), count: 0, converted: 0, rate: 0, eligible: 0 }
    cur.count += 1
    if (a.source !== 'auto') {
      cur.eligible += 1
      if (isConverted(a.outcome)) cur.converted += 1
    }
    cur.rate = cur.eligible === 0 ? 0 : cur.converted / cur.eligible
    map.set(key, cur)
  }
  return [...map.values()]
    .filter((p) => p.count >= minCount)
    .sort((a, b) => b.rate - a.rate || b.count - a.count)
}

export function placeConversionNote(
  approaches: Approach[],
): { better: string; worse: string; betterRate: number; worseRate: number } | null {
  const ranks = rankPlaces(approaches)
  if (ranks.length < 2) return null
  const better = ranks[0]
  const worse = [...ranks].sort((a, b) => a.rate - b.rate || a.count - b.count)[0]
  if (!better || !worse || better.place === worse.place || better.rate <= worse.rate) return null
  return {
    better: better.place,
    worse: worse.place,
    betterRate: better.rate,
    worseRate: worse.rate,
  }
}

export function dueFollowUps(approaches: Approach[], now = new Date()): Approach[] {
  return approaches
    .filter((a) => Boolean(a.followUpAt) && !a.followUpDone && isFollowUpDue(a.followUpAt!, now))
    .sort((a, b) => (a.followUpAt! < b.followUpAt! ? -1 : 1))
}

export function followUpRate(approaches: Approach[]): {
  done: number
  total: number
  rate: number | null
} {
  const tracked = approaches.filter((a) => a.followUpAt)
  const done = tracked.filter((a) => a.followUpDone).length
  const total = tracked.length
  return { done, total, rate: total === 0 ? null : done / total }
}

export function outcomeMix(approaches: Approach[]): { outcome: Outcome; label: string; count: number }[] {
  return OUTCOMES.map((outcome) => ({
    outcome,
    label: OUTCOME_LABEL[outcome],
    count: approaches.filter((a) => a.outcome === outcome).length,
  })).filter((row) => row.count > 0)
}

export type Bucket = {
  label: string
  count: number
  converted: number
  rate: number
}

export function hourStats(approaches: Approach[]): Bucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    converted: 0,
  }))
  for (const a of approaches) {
    const hour = new Date(a.at).getHours()
    buckets[hour].count += 1
    if (a.source !== 'auto' && isConverted(a.outcome)) buckets[hour].converted += 1
  }
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => {
      const d = new Date()
      d.setHours(b.hour, 0, 0, 0)
      return {
        label: d.toLocaleTimeString(undefined, { hour: 'numeric' }),
        count: b.count,
        converted: b.converted,
        rate: b.converted / b.count,
      }
    })
    .sort((a, b) => b.count - a.count || b.rate - a.rate)
}

export function weekdayStats(approaches: Approach[]): Bucket[] {
  const buckets = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    label: weekdayShort(i),
    count: 0,
    converted: 0,
  }))
  for (const a of approaches) {
    const index = (new Date(a.at).getDay() + 6) % 7
    buckets[index].count += 1
    if (a.source !== 'auto' && isConverted(a.outcome)) buckets[index].converted += 1
  }
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      label: b.label,
      count: b.count,
      converted: b.converted,
      rate: b.converted / b.count,
    }))
    .sort((a, b) => b.count - a.count || b.rate - a.rate)
}

export function quietStretch(
  approaches: Approach[],
): { days: number; weekday: string } | null {
  if (approaches.length === 0) return null
  let latest = approaches[0].at
  for (const a of approaches) {
    if (a.at > latest) latest = a.at
  }
  const lastDay = new Date(latest)
  lastDay.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - lastDay.getTime()) / 86_400_000)
  if (days < 2) return null
  return { days, weekday: weekdayName(new Date(latest)) }
}

export type PersonCard = {
  who: string
  lastAt: string
  nextStep: string
}

export function peopleWithNumbers(approaches: Approach[]): PersonCard[] {
  const byWho = new Map<string, Approach[]>()
  for (const a of approaches) {
    const key = a.who.trim().toLowerCase()
    if (!key) continue
    const list = byWho.get(key) ?? []
    list.push(a)
    byWho.set(key, list)
  }
  const cards: PersonCard[] = []
  for (const list of byWho.values()) {
    if (!list.some((a) => a.outcome === 'number')) continue
    list.sort((a, b) => (a.at < b.at ? 1 : -1))
    const last = list[0]
    const pending = list.find((a) => a.followUpAt && !a.followUpDone)
    let nextStep = 'Reach out when it feels right'
    if (pending?.followUpAt) nextStep = `Follow up ${formatShortDate(pending.followUpAt)}`
    else if (last.outcome !== 'number') nextStep = OUTCOME_LABEL[last.outcome]
    cards.push({ who: last.who, lastAt: last.at, nextStep })
  }
  cards.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  return cards
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
