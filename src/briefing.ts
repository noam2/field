import {
  dueFollowUps,
  pct,
  recordingsOnly,
  successByDaypart,
  successByPlaceType,
} from './stats'
import type { Approach } from './types'

export type Briefing = {
  headline: string
  detail: string
}

type Contrast = {
  better: string
  worse: string
  betterRate: number
  worseRate: number
  n: number
  diff: number
}

function pluralize(label: string): string {
  if (/s$/i.test(label)) return label
  if (/y$/i.test(label) && !/[aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`
  return `${label}s`
}

function pairContrasts(rows: { label: string; count: number; rate: number }[]): Contrast[] {
  const eligible = rows.filter((r) => r.count >= 2)
  const out: Contrast[] = []
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i]
      const b = eligible[j]
      const diff = Math.abs(a.rate - b.rate)
      if (diff < 0.15) continue
      const [better, worse] = a.rate >= b.rate ? [a, b] : [b, a]
      out.push({
        better: better.label,
        worse: worse.label,
        betterRate: better.rate,
        worseRate: worse.rate,
        n: better.count + worse.count,
        diff,
      })
    }
  }
  return out
}

export function briefing(approaches: Approach[], now = new Date()): Briefing | null {
  const recs = recordingsOnly(approaches)
  if (recs.length < 3) return null

  const candidates = [
    ...pairContrasts(successByDaypart(recs)),
    ...pairContrasts(successByPlaceType(recs, 1)),
  ]
  candidates.sort((a, b) => b.diff - a.diff || b.n - a.n)
  if (candidates.length === 0) return null

  const best = candidates[0]
  const headline = `${pluralize(best.better)} convert better than ${pluralize(best.worse).toLowerCase()} (${pct(best.betterRate)} vs ${pct(best.worseRate)}, n=${best.n}).`
  const due = dueFollowUps(approaches, now).length
  const detail =
    due === 0 ? '' : due === 1 ? '1 follow-up waiting.' : `${due} follow-ups waiting.`
  return { headline, detail }
}
