import { describe, expect, it } from 'vitest'
import { briefing } from './briefing'
import { approach } from './test/helpers'
import type { Insight } from './types'
import { emptyInsight } from './understand'

function rec(over: Parameters<typeof approach>[0] & { insight?: Insight | null } = {}) {
  return approach({
    source: 'recording',
    dwellSeconds: 60,
    ...over,
  })
}

function ins(over: Partial<Insight>): Insight {
  return { ...emptyInsight(), ...over }
}

describe('briefing', () => {
  it('returns null with fewer than 3 recordings', () => {
    const rows = [
      rec({
        insight: ins({ success: true, daypart: 'evening', placeType: 'bar' }),
      }),
      rec({
        insight: ins({ success: false, daypart: 'morning', placeType: 'library' }),
      }),
    ]
    expect(briefing(rows)).toBeNull()
  })

  it('picks evening vs morning when rates differ by 15+ points', () => {
    const evening = '2026-08-30T18:00:00.000Z'
    const morning = '2026-08-30T06:00:00.000Z'
    const rows = [
      rec({ at: evening, insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ at: evening, insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ at: morning, insight: ins({ success: false, daypart: 'morning', placeType: 'cafe' }) }),
      rec({ at: morning, insight: ins({ success: false, daypart: 'morning', placeType: 'cafe' }) }),
    ]
    const b = briefing(rows)
    expect(b).not.toBeNull()
    expect(b!.headline).toBe('Evenings convert better than mornings (100% vs 0%, n=4).')
    expect(b!.detail).toBe('')
  })

  it('picks place type when that contrast is strongest', () => {
    const rows = [
      rec({
        place: 'Bar Y',
        insight: ins({ success: true, daypart: 'evening', placeType: 'bar' }),
      }),
      rec({
        place: 'Bar Y',
        insight: ins({ success: true, daypart: 'morning', placeType: 'bar' }),
      }),
      rec({
        place: 'Library',
        insight: ins({ success: false, daypart: 'evening', placeType: 'library' }),
      }),
      rec({
        place: 'Library',
        insight: ins({ success: false, daypart: 'morning', placeType: 'library' }),
      }),
    ]
    const b = briefing(rows)
    expect(b!.headline).toBe('Bars convert better than libraries (100% vs 0%, n=4).')
  })

  it('mentions follow-ups in detail', () => {
    const now = new Date('2026-08-30T12:00:00.000Z')
    const evening = '2026-08-30T18:00:00.000Z'
    const morning = '2026-08-30T06:00:00.000Z'
    const rows = [
      rec({ at: evening, insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ at: evening, insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ at: morning, insight: ins({ success: false, daypart: 'morning', placeType: 'cafe' }) }),
      rec({
        at: morning,
        insight: ins({ success: false, daypart: 'morning', placeType: 'cafe' }),
        followUpAt: '2026-08-29T12:00:00.000Z',
        followUpDone: false,
        who: 'Maya',
      }),
      rec({
        at: morning,
        insight: ins({ success: false, daypart: 'afternoon', placeType: 'cafe' }),
        followUpAt: '2026-08-28T12:00:00.000Z',
        followUpDone: false,
        who: 'Noa',
      }),
      rec({
        at: morning,
        insight: ins({ success: false, daypart: 'afternoon', placeType: 'cafe' }),
        followUpAt: '2026-08-27T12:00:00.000Z',
        followUpDone: false,
        who: 'Lee',
      }),
    ]
    const b = briefing(rows, now)
    expect(b!.detail).toBe('3 follow-ups waiting.')
  })

  it('ignores a contrast under 15 points', () => {
    const under = [
      rec({ insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: true, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: false, daypart: 'evening', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: true, daypart: 'morning', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: true, daypart: 'morning', placeType: 'cafe' }) }),
      rec({ insight: ins({ success: false, daypart: 'morning', placeType: 'cafe' }) }),
    ]
    // evening 75% vs morning ~67% = 8 points
    expect(briefing(under)).toBeNull()
  })
})
