import { classifyPlaceType, daypartFromIso, DAYPART_LABEL, PLACE_TYPE_LABEL } from './place'
import type { Approach, Daypart, Outcome, PlaceType, Sentiment, SpokenLanguage } from './types'
import { DAYPARTS, PLACE_TYPES } from './types'
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

export const SENTIMENTS: Sentiment[] = ['positive', 'mixed', 'negative', 'neutral']

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
    const gotNumber = a.insight?.exchangedContact || a.outcome === 'number'
    if (!gotNumber || a.followUpDone) return false
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

export function approachSuccess(a: Approach): boolean {
  if (a.insight) return a.insight.success
  if (a.analysis) {
    return (a.analysis.exchangedContact || a.analysis.scheduled) && a.analysis.outcome !== 'no'
  }
  return isConverted(a.outcome)
}

export function approachSentiment(a: Approach): Sentiment {
  if (a.insight) return a.insight.sentiment
  if (a.analysis?.outcome === 'no' || a.outcome === 'no') return 'negative'
  if (approachSuccess(a)) return 'positive'
  return 'neutral'
}

export function approachValence(a: Approach): number {
  if (a.insight) return a.insight.valence
  if (a.analysis?.outcome === 'no' || a.outcome === 'no') return -0.5
  if (approachSuccess(a)) return 0.5
  return 0
}

export function approachTopics(a: Approach): string[] {
  return a.insight?.topics ?? a.analysis?.topics ?? []
}

export function approachCommitments(a: Approach): string[] {
  return a.insight?.commitments ?? a.analysis?.commitments ?? []
}

export function exchangedContactOf(a: Approach): boolean {
  return a.insight?.exchangedContact || a.analysis?.exchangedContact || a.outcome === 'number'
}

export function scheduledOf(a: Approach): boolean {
  return a.insight?.scheduled || a.analysis?.scheduled || a.outcome === 'date'
}

export function rejectionOf(a: Approach): boolean {
  if (a.insight) return a.insight.rejection
  return a.analysis?.outcome === 'no' || a.outcome === 'no'
}

export function questionsOf(a: Approach): number {
  return a.insight?.questionsAsked ?? a.analysis?.questionCount ?? 0
}

export function successRate(approaches: Approach[]): number {
  const n = approaches.length
  if (n === 0) return 0
  return approaches.filter(approachSuccess).length / n
}

export function filterByHours(approaches: Approach[], hours: number[]): Approach[] {
  const set = new Set(hours)
  return approaches.filter((a) => set.has(new Date(a.at).getHours()))
}

export function sentimentCounts(approaches: Approach[]): Record<Sentiment, number> {
  const counts: Record<Sentiment, number> = {
    positive: 0,
    mixed: 0,
    negative: 0,
    neutral: 0,
  }
  for (const a of approaches) counts[approachSentiment(a)] += 1
  return counts
}

export function topicCounts(approaches: Approach[]): { topic: string; count: number }[] {
  const topicMap = new Map<string, number>()
  for (const a of approaches) {
    for (const t of approachTopics(a)) {
      topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
    }
  }
  return [...topicMap.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}

export type RecordingStats = {
  conversations: number
  talkTimeSeconds: number
  contactRate: number
  scheduleRate: number
  rejectionRate: number
  successRate: number
  questionRate: number
  topics: { topic: string; count: number }[]
  sentiment: Record<Sentiment, number>
}

export function recordingStats(approaches: Approach[]): RecordingStats {
  const rows = recordingsOnly(approaches)
  const n = rows.length
  const talkTimeSeconds = rows.reduce((s, a) => s + (a.dwellSeconds ?? 0), 0)
  const contacts = rows.filter(exchangedContactOf).length
  const scheduled = rows.filter(scheduledOf).length
  const rejections = rows.filter(rejectionOf).length
  const questions = rows.reduce((s, a) => s + questionsOf(a), 0)
  return {
    conversations: n,
    talkTimeSeconds,
    contactRate: n === 0 ? 0 : contacts / n,
    scheduleRate: n === 0 ? 0 : scheduled / n,
    rejectionRate: n === 0 ? 0 : rejections / n,
    successRate: successRate(rows),
    questionRate: n === 0 ? 0 : questions / n,
    topics: topicCounts(rows),
    sentiment: sentimentCounts(rows),
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
      if (approachSuccess(a)) cur.converted += 1
    }
    cur.rate = cur.eligible === 0 ? 0 : cur.converted / cur.eligible
    map.set(key, cur)
  }
  return [...map.values()]
    .filter((p) => p.count >= minCount)
    .sort((a, b) => b.rate - a.rate || b.count - a.count)
}

export function successByPlace(approaches: Approach[], minCount = 2): PlaceRank[] {
  return rankPlaces(approaches, minCount)
}

export type PlaceValence = {
  place: string
  count: number
  valence: number
}

export function meanValenceByPlace(approaches: Approach[], minCount = 2): PlaceValence[] {
  const map = new Map<string, { place: string; count: number; sum: number }>()
  for (const a of approaches) {
    const key = a.place.trim().toLowerCase()
    if (!key) continue
    const cur = map.get(key) ?? { place: a.place.trim(), count: 0, sum: 0 }
    cur.count += 1
    cur.sum += approachValence(a)
    map.set(key, cur)
  }
  return [...map.values()]
    .filter((p) => p.count >= minCount)
    .map((p) => ({ place: p.place, count: p.count, valence: p.sum / p.count }))
    .sort((a, b) => b.valence - a.valence || b.count - a.count)
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

export function modelFollowUps(approaches: Approach[]): {
  id: string
  who: string
  place: string
  suggestion: string
}[] {
  const rows: { id: string; who: string; place: string; suggestion: string }[] = []
  for (const a of approaches) {
    const suggestion = a.insight?.followUpSuggestion
    if (!suggestion || a.followUpDone) continue
    rows.push({
      id: a.id,
      who: (a.insight?.who || a.who).trim(),
      place: a.place,
      suggestion,
    })
  }
  return rows
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
    if (a.source !== 'auto' && approachSuccess(a)) buckets[hour].converted += 1
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
    .sort((a, b) => b.rate - a.rate || b.count - a.count)
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
    if (a.source !== 'auto' && approachSuccess(a)) buckets[index].converted += 1
  }
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      label: b.label,
      count: b.count,
      converted: b.converted,
      rate: b.converted / b.count,
    }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count)
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
    if (!list.some((a) => exchangedContactOf(a))) continue
    list.sort((a, b) => (a.at < b.at ? 1 : -1))
    const last = list[0]
    const pending = list.find((a) => a.followUpAt && !a.followUpDone)
    let nextStep = last.insight?.followUpSuggestion || 'Reach out when it feels right'
    if (pending?.followUpAt) nextStep = `Follow up ${formatShortDate(pending.followUpAt)}`
    else if (last.outcome !== 'number' && !last.insight?.exchangedContact) nextStep = OUTCOME_LABEL[last.outcome]
    cards.push({ who: last.who, lastAt: last.at, nextStep })
  }
  cards.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  return cards
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function approachDaypart(a: Approach): Daypart {
  return a.insight?.daypart ?? daypartFromIso(a.at)
}

export function approachPlaceType(a: Approach): PlaceType {
  if (a.insight?.placeType && a.insight.placeType !== 'other') return a.insight.placeType
  return classifyPlaceType(a.place)
}

export function approachLanguage(a: Approach): SpokenLanguage | null {
  return a.insight?.language ?? null
}

export function successByDaypart(approaches: Approach[]): Bucket[] {
  const groups = new Map<Daypart, { count: number; converted: number }>()
  for (const d of DAYPARTS) groups.set(d, { count: 0, converted: 0 })
  for (const a of approaches) {
    const d = approachDaypart(a)
    const g = groups.get(d)!
    g.count += 1
    if (approachSuccess(a)) g.converted += 1
  }
  return DAYPARTS.map((d) => {
    const g = groups.get(d)!
    return {
      label: DAYPART_LABEL[d],
      count: g.count,
      converted: g.converted,
      rate: g.count === 0 ? 0 : g.converted / g.count,
    }
  }).filter((b) => b.count > 0)
}

export function successByPlaceType(approaches: Approach[], minCount = 1): Bucket[] {
  const groups = new Map<PlaceType, { count: number; converted: number }>()
  for (const a of approaches) {
    const t = approachPlaceType(a)
    const g = groups.get(t) ?? { count: 0, converted: 0 }
    g.count += 1
    if (approachSuccess(a)) g.converted += 1
    groups.set(t, g)
  }
  return PLACE_TYPES.filter((t) => (groups.get(t)?.count ?? 0) >= minCount).map((t) => {
    const g = groups.get(t)!
    return {
      label: PLACE_TYPE_LABEL[t],
      count: g.count,
      converted: g.converted,
      rate: g.count === 0 ? 0 : g.converted / g.count,
    }
  }).sort((a, b) => b.rate - a.rate || b.count - a.count)
}

export function languageCounts(approaches: Approach[]): {
  he: number
  en: number
  mixed: number
  known: number
} {
  const counts = { he: 0, en: 0, mixed: 0, known: 0 }
  for (const a of approaches) {
    const lang = approachLanguage(a)
    if (!lang) continue
    counts[lang] += 1
    counts.known += 1
  }
  return counts
}
