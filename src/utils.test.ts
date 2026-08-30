import { describe, expect, it } from 'vitest'
import { approach } from './test/helpers'
import {
  addDays,
  computeStreak,
  daysSinceLast,
  fromDatetimeLocalValue,
  isApproach,
  isConverted,
  isFollowUpDue,
  normalizeWho,
  recentPlaces,
  sameWho,
  startOfWeekMonday,
  toDatetimeLocalValue,
} from './utils'

describe('startOfWeekMonday', () => {
  it('is Monday', () => {
    const samples = [
      new Date(2026, 7, 30),
      new Date(2026, 7, 31),
      new Date(2026, 8, 2),
      new Date(2026, 8, 6),
    ]
    for (const d of samples) {
      const start = startOfWeekMonday(d)
      expect(start.getDay()).toBe(1)
      expect(start.getHours()).toBe(0)
    }
  })
})

describe('computeStreak', () => {
  it('empty is 0', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('today + yesterday is 2', () => {
    const today = new Date()
    const yest = addDays(today, -1)
    expect(
      computeStreak([approach({ at: today.toISOString() }), approach({ at: yest.toISOString() })]),
    ).toBe(2)
  })

  it('gap resets', () => {
    const today = new Date()
    const gap = addDays(today, -3)
    expect(
      computeStreak([approach({ at: today.toISOString() }), approach({ at: gap.toISOString() })]),
    ).toBe(1)
  })

  it('yesterday-only counts as 1', () => {
    const yest = addDays(new Date(), -1)
    expect(computeStreak([approach({ at: yest.toISOString() })])).toBe(1)
  })
})

describe('daysSinceLast', () => {
  it('null when empty', () => {
    expect(daysSinceLast([])).toBeNull()
  })

  it('0 when last is today', () => {
    expect(daysSinceLast([approach({ at: new Date().toISOString() })])).toBe(0)
  })

  it('counts whole days', () => {
    const three = addDays(new Date(), -3)
    three.setHours(12, 0, 0, 0)
    expect(daysSinceLast([approach({ at: three.toISOString() })])).toBe(3)
  })
})

describe('isConverted', () => {
  it('number and date are true, talked is false', () => {
    expect(isConverted('number')).toBe(true)
    expect(isConverted('date')).toBe(true)
    expect(isConverted('talked')).toBe(false)
    expect(isConverted('chat')).toBe(false)
    expect(isConverted('no')).toBe(false)
  })
})

describe('isFollowUpDue', () => {
  it('today and past are true, tomorrow is false', () => {
    const today = new Date()
    today.setHours(9, 0, 0, 0)
    expect(isFollowUpDue(today.toISOString(), today)).toBe(true)
    expect(isFollowUpDue(addDays(today, -2).toISOString(), today)).toBe(true)
    expect(isFollowUpDue(addDays(today, 1).toISOString(), today)).toBe(false)
  })
})

describe('normalizeWho / sameWho', () => {
  it('trims and lowercases', () => {
    expect(normalizeWho('  Maya  ')).toBe('maya')
  })

  it('matches regardless of case', () => {
    const a = approach({ who: 'Maya' })
    expect(sameWho(a, 'maya')).toBe(true)
    expect(sameWho(a, 'Alex')).toBe(false)
    expect(sameWho(a, '')).toBe(false)
  })
})

describe('recentPlaces', () => {
  it('unique newest first', () => {
    const places = recentPlaces([
      approach({ place: 'A', at: '2026-08-30T12:00:00.000Z' }),
      approach({ place: 'B', at: '2026-08-29T12:00:00.000Z' }),
      approach({ place: 'a', at: '2026-08-28T12:00:00.000Z' }),
      approach({ place: 'C', at: '2026-08-27T12:00:00.000Z' }),
    ])
    expect(places).toEqual(['A', 'B', 'C'])
  })
})

describe('isApproach', () => {
  it('accepts a valid object', () => {
    expect(isApproach(approach())).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isApproach(null)).toBe(false)
    expect(isApproach({})).toBe(false)
    expect(isApproach('nope')).toBe(false)
    expect(isApproach({ ...approach(), outcome: 'nope' })).toBe(false)
    expect(isApproach({ ...approach(), id: 1 })).toBe(false)
  })
})

describe('fromDatetimeLocalValue', () => {
  it('roundtrips local wall time', () => {
    const d = new Date()
    d.setSeconds(0, 0)
    const local = toDatetimeLocalValue(d)
    const back = new Date(fromDatetimeLocalValue(local))
    expect(back.getFullYear()).toBe(d.getFullYear())
    expect(back.getMonth()).toBe(d.getMonth())
    expect(back.getDate()).toBe(d.getDate())
    expect(back.getHours()).toBe(d.getHours())
    expect(back.getMinutes()).toBe(d.getMinutes())
  })
})
