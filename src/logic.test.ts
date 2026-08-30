import { describe, expect, it } from 'vitest'
import { dueFollowUps, rankPlaces, recordingStats, unusedNumbers, weekCounts } from './stats'
import { approach, recording } from './test/helpers'
import { addDays, startOfWeekMonday } from './utils'

describe('week counts', () => {
  it('this week vs last week', () => {
    const now = new Date(2026, 7, 30, 15, 0, 0)
    const thisStart = startOfWeekMonday(now)
    const lastStart = addDays(thisStart, -7)
    const rows = [
      approach({ at: addDays(thisStart, 1).toISOString() }),
      approach({ at: addDays(lastStart, 1).toISOString() }),
      approach({ at: addDays(lastStart, -1).toISOString() }),
    ]
    expect(weekCounts(rows, now)).toEqual({ thisWeek: 1, lastWeek: 1 })
  })
})

describe('unused numbers', () => {
  it('appears when a number has no follow-up done', () => {
    const open = approach({
      who: 'Maya',
      outcome: 'number',
      followUpDone: false,
      at: '2026-08-20T12:00:00.000Z',
    })
    expect(unusedNumbers([open]).map((a) => a.id)).toEqual([open.id])
  })

  it('hides a number that was followed up or has a later approach', () => {
    const done = approach({ who: 'Alex', outcome: 'number', followUpDone: true })
    const first = approach({
      who: 'Sam',
      outcome: 'number',
      followUpDone: false,
      at: '2026-08-10T12:00:00.000Z',
    })
    const later = approach({
      who: 'Sam',
      outcome: 'talked',
      at: '2026-08-20T12:00:00.000Z',
    })
    expect(unusedNumbers([done, first, later])).toEqual([])
  })
})

describe('place conversion ranking', () => {
  it('ranks places with 3+ approaches', () => {
    const cafe = Array.from({ length: 3 }, () => approach({ place: 'Café', outcome: 'number' }))
    const park = Array.from({ length: 3 }, () => approach({ place: 'Park', outcome: 'talked' }))
    const ranks = rankPlaces([...cafe, ...park])
    expect(ranks[0]?.place).toBe('Café')
    expect(ranks[0]?.rate).toBe(1)
    expect(ranks[1]?.place).toBe('Park')
    expect(ranks[1]?.rate).toBe(0)
  })
})

describe('due follow-ups', () => {
  it('includes overdue, excludes future and done', () => {
    const now = new Date(2026, 7, 30, 12, 0, 0)
    const overdue = approach({
      followUpAt: addDays(now, -2).toISOString(),
      followUpDone: false,
    })
    const today = approach({
      followUpAt: now.toISOString(),
      followUpDone: false,
    })
    const future = approach({
      followUpAt: addDays(now, 1).toISOString(),
      followUpDone: false,
    })
    const done = approach({
      followUpAt: addDays(now, -1).toISOString(),
      followUpDone: true,
    })
    const list = dueFollowUps([overdue, today, future, done], now).map((a) => a.id)
    expect(list).toEqual([overdue.id, today.id])
  })
})


describe('auto rows do not poison conversion', () => {
  it('volume counts auto, rate uses non-auto only', () => {
    const auto = Array.from({ length: 3 }, () =>
      approach({ place: 'Café', source: 'auto', outcome: 'other' }),
    )
    const manual = Array.from({ length: 3 }, () =>
      approach({ place: 'Café', source: 'manual', outcome: 'number' }),
    )
    const ranks = rankPlaces([...auto, ...manual])
    expect(ranks[0]?.count).toBe(6)
    expect(ranks[0]?.rate).toBe(1)
  })
})

describe('recordingStats', () => {
  it('uses recordings only', () => {
    const rec = recording("Hey I'm Maya. What do you do? Here's my number 555-867-5309.", {
      dwellSeconds: 80,
    })
    const leftover = approach({ source: 'manual', outcome: 'number' })
    const s = recordingStats([rec, leftover])
    expect(s.conversations).toBe(1)
    expect(s.talkTimeSeconds).toBe(80)
    expect(s.contactRate).toBe(1)
  })
})
