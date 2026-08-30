import { describe, expect, it } from 'vitest'
import {
  filterByHours,
  sentimentCounts,
  successByDaypart,
  successByPlace,
  successByPlaceType,
  successRate,
  topicCounts,
} from './stats'
import { approach } from './test/helpers'
import type { Insight, Sentiment } from './types'
import { parseInsightJson } from './understand'

type Fixture = {
  hour: number
  place: 'Cafe X' | 'Bar Y'
  transcript: string
  model: Record<string, unknown>
}

function modelJson(over: {
  sentiment: Sentiment
  success: boolean
  valence: number
  who: string
  topics: string[]
  summary: string
  exchangedContact?: boolean
  scheduled?: boolean
  rejection?: boolean
  outcome?: Insight['outcome']
  commitments?: string[]
  objections?: string[]
  followUpSuggestion?: string | null
  questionsAsked?: number
  energy?: Insight['energy']
}): Record<string, unknown> {
  const exchangedContact = over.exchangedContact ?? over.success
  const scheduled = over.scheduled ?? false
  const rejection = over.rejection ?? (!over.success && over.sentiment === 'negative')
  const outcome =
    over.outcome ??
    (rejection ? 'no' : exchangedContact ? 'number' : scheduled ? 'date' : 'talked')
  return {
    sentiment: over.sentiment,
    success: over.success,
    valence: over.valence,
    outcome,
    who: over.who,
    topics: over.topics,
    commitments: over.commitments ?? [],
    objections: over.objections ?? [],
    questionsAsked: over.questionsAsked ?? 1,
    energy: over.energy ?? 'medium',
    summary: over.summary,
    followUpSuggestion: over.followUpSuggestion ?? (over.success ? 'Follow up tomorrow.' : null),
    exchangedContact,
    scheduled,
    rejection,
    model: 'gpt-4o-mini',
  }
}

const ENCOUNTERS: Fixture[] = [
  {
    hour: 9,
    place: 'Cafe X',
    transcript: "Hey I am Maya. What do you do? Here is my number 555-0101. Let's stay in touch.",
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.8,
      who: 'Maya',
      topics: ['work'],
      summary: 'Maya swapped numbers after talking about work.',
      exchangedContact: true,
    }),
  },
  {
    hour: 10,
    place: 'Cafe X',
    transcript: "I am Alex. Want to get coffee tomorrow? I travel a lot for work.",
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.6,
      who: 'Alex',
      topics: ['travel'],
      summary: 'Alex scheduled coffee and talked about travel.',
      exchangedContact: false,
      scheduled: true,
    }),
  },
  {
    hour: 8,
    place: 'Cafe X',
    transcript: 'We talked about food for a bit then they had to run to a meeting.',
    model: modelJson({
      sentiment: 'mixed',
      success: false,
      valence: 0.1,
      who: 'Sam',
      topics: ['food'],
      summary: 'Short mixed chat about food with no contact.',
      exchangedContact: false,
      rejection: false,
    }),
  },
  {
    hour: 11,
    place: 'Cafe X',
    transcript: 'Gotta go, not interested. We mentioned work though.',
    model: modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.7,
      who: '',
      topics: ['work'],
      summary: 'A work mention ended in a clear rejection.',
      exchangedContact: false,
      rejection: true,
    }),
  },
  {
    hour: 19,
    place: 'Cafe X',
    transcript: 'Loved that concert. Here is my instagram @lee.field so we can swap playlists.',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.75,
      who: 'Lee',
      topics: ['music'],
      summary: 'Lee shared Instagram after talking music.',
      exchangedContact: true,
    }),
  },
  {
    hour: 20,
    place: 'Cafe X',
    transcript: 'This dinner was great. Let us meet Saturday for pizza.',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.7,
      who: 'Jordan',
      topics: ['food'],
      summary: 'Jordan scheduled a weekend pizza meetup.',
      exchangedContact: false,
      scheduled: true,
    }),
  },
  {
    hour: 18,
    place: 'Cafe X',
    transcript: 'I am visiting from Lisbon. Want to walk the market tomorrow?',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.65,
      who: 'Rita',
      topics: ['travel'],
      summary: 'Rita planned a market walk after travel talk.',
      exchangedContact: false,
      scheduled: true,
    }),
  },
  {
    hour: 21,
    place: 'Cafe X',
    transcript: 'The bar next door is loud. Here is my number anyway, 555-2222.',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.55,
      who: 'Kim',
      topics: ['nightlife'],
      summary: 'Kim still exchanged a number despite the noise.',
      exchangedContact: true,
    }),
  },
  {
    hour: 9,
    place: 'Bar Y',
    transcript: 'Too loud in here. No thanks, not interested in chatting.',
    model: modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.6,
      who: '',
      topics: ['nightlife'],
      summary: 'Nightlife noise and a rejection.',
      exchangedContact: false,
      rejection: true,
    }),
  },
  {
    hour: 10,
    place: 'Bar Y',
    transcript: 'I have to get back to the office. Not interested.',
    model: modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.5,
      who: '',
      topics: ['work'],
      summary: 'Work excuse and a rejection.',
      exchangedContact: false,
      rejection: true,
    }),
  },
  {
    hour: 8,
    place: 'Bar Y',
    transcript: 'The playlist is fine. They seemed tired and the chat fizzled.',
    model: modelJson({
      sentiment: 'mixed',
      success: false,
      valence: 0,
      who: '',
      topics: ['music'],
      summary: 'Mixed energy, no plan.',
      exchangedContact: false,
      rejection: false,
    }),
  },
  {
    hour: 11,
    place: 'Bar Y',
    transcript: 'They grabbed fries then left. No number, no plan.',
    model: modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.3,
      who: '',
      topics: ['food'],
      summary: 'Food talk then they left.',
      exchangedContact: false,
      rejection: false,
      outcome: 'other',
    }),
  },
  {
    hour: 19,
    place: 'Bar Y',
    transcript: 'Gotta go. The club is packed.',
    model: modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.8,
      who: '',
      topics: ['nightlife'],
      summary: 'Rejection in a packed club.',
      exchangedContact: false,
      rejection: true,
    }),
  },
  {
    hour: 20,
    place: 'Bar Y',
    transcript: 'Work has been rough. They were polite but not open to meeting.',
    model: modelJson({
      sentiment: 'mixed',
      success: false,
      valence: -0.1,
      who: '',
      topics: ['work'],
      summary: 'Polite mixed chat about work, no success.',
      exchangedContact: false,
      rejection: false,
    }),
  },
  {
    hour: 18,
    place: 'Bar Y',
    transcript: 'Let us grab a drink this weekend. Here is my number 555-3333.',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.6,
      who: 'Pat',
      topics: ['nightlife'],
      summary: 'Pat swapped a number and planned drinks.',
      exchangedContact: true,
      scheduled: true,
    }),
  },
  {
    hour: 22,
    place: 'Bar Y',
    transcript: 'We talked music for a while and they asked me to text the set list.',
    model: modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.5,
      who: 'Noa',
      topics: ['music'],
      summary: 'Noa asked for a follow-up text about music.',
      exchangedContact: true,
    }),
  },
]

function rowsFromFixtures() {
  return ENCOUNTERS.map((enc, i) => {
    const insight = parseInsightJson(enc.model)
    if (!insight) throw new Error(`fixture ${i} failed parseInsightJson`)
    const at = new Date(2026, 7, 30, enc.hour, 0, 0, 0).toISOString()
    return approach({
      id: `sim-${i}`,
      at,
      place: enc.place,
      who: insight.who,
      source: 'recording',
      transcript: enc.transcript,
      insight,
      analysisSource: 'model',
      outcome: insight.outcome,
      notes: insight.summary,
      dwellSeconds: 90,
    })
  })
}

describe('simulation suite', () => {
  it('aggregates 16 canned encounters with real stats functions', () => {
    expect(ENCOUNTERS).toHaveLength(16)
    const rows = rowsFromFixtures()
    expect(rows).toHaveLength(16)

    expect(successRate(rows)).toBe(0.5)

    const places = successByPlace(rows, 2)
    const cafe = places.find((p) => p.place === 'Cafe X')
    const bar = places.find((p) => p.place === 'Bar Y')
    expect(cafe?.count).toBe(8)
    expect(bar?.count).toBe(8)
    expect(cafe!.rate).toBeGreaterThan(bar!.rate)
    expect(cafe!.rate).toBe(0.75)
    expect(bar!.rate).toBe(0.25)

    const morning = successRate(filterByHours(rows, [8, 9, 10, 11]))
    const evening = successRate(filterByHours(rows, [18, 19, 20, 21, 22]))
    expect(morning).toBe(0.25)
    expect(evening).toBe(0.75)
    expect(evening).not.toBe(morning)

    const sent = sentimentCounts(rows)
    expect(sent.positive).toBe(8)
    expect(sent.negative).toBe(5)
    expect(sent.mixed).toBe(3)
    expect(sent.neutral).toBe(0)

    const topics = Object.fromEntries(topicCounts(rows).map((t) => [t.topic, t.count]))
    expect(topics.work).toBe(4)
    expect(topics.travel).toBe(2)
    expect(topics.food).toBe(3)
    expect(topics.music).toBe(3)
    expect(topics.nightlife).toBe(4)

    const types = successByPlaceType(rows, 1)
    const cafeType = types.find((t) => t.label === 'Cafe')
    const barType = types.find((t) => t.label === 'Bar')
    expect(cafeType?.count).toBe(8)
    expect(barType?.count).toBe(8)
    expect(cafeType!.rate).toBe(0.75)
    expect(barType!.rate).toBe(0.25)

    const parts = successByDaypart(rows)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...parts.map((d) => d.rate))).toBeGreaterThan(Math.min(...parts.map((d) => d.rate)))
  })
})

describe('place type and daypart stats', () => {
  it('beach-night outperforms library-morning', () => {
    const night = '2026-08-30T21:30:00.000Z' // 00:30 IDT
    const morning = '2026-08-30T05:30:00.000Z' // 08:30 IDT
    const beachOk = modelJson({
      sentiment: 'positive',
      success: true,
      valence: 0.8,
      who: 'Noa',
      topics: ['travel'],
      summary: 'Number at the beach.',
      exchangedContact: true,
    })
    beachOk.placeType = 'beach'
    beachOk.daypart = 'night'
    beachOk.language = 'he'
    const libNo = modelJson({
      sentiment: 'negative',
      success: false,
      valence: -0.4,
      who: '',
      topics: ['school'],
      summary: 'Quiet rejection at the library.',
      exchangedContact: false,
      rejection: true,
    })
    libNo.placeType = 'library'
    libNo.daypart = 'morning'
    libNo.language = 'en'

    const rows = [
      approach({
        id: 'bn-1',
        at: night,
        place: 'Gordon Beach',
        source: 'recording',
        insight: parseInsightJson(beachOk),
        analysisSource: 'model',
        outcome: 'number',
        dwellSeconds: 80,
      }),
      approach({
        id: 'bn-2',
        at: night,
        place: 'חוף התלאביב',
        source: 'recording',
        insight: parseInsightJson(beachOk),
        analysisSource: 'model',
        outcome: 'number',
        dwellSeconds: 70,
      }),
      approach({
        id: 'lm-1',
        at: morning,
        place: 'Dizengoff library',
        source: 'recording',
        insight: parseInsightJson(libNo),
        analysisSource: 'model',
        outcome: 'no',
        dwellSeconds: 40,
      }),
      approach({
        id: 'lm-2',
        at: morning,
        place: 'Dizengoff library',
        source: 'recording',
        insight: parseInsightJson(libNo),
        analysisSource: 'model',
        outcome: 'no',
        dwellSeconds: 35,
      }),
    ]

    const types = successByPlaceType(rows, 1)
    const beach = types.find((t) => t.label === 'Beach')
    const library = types.find((t) => t.label === 'Library')
    expect(beach?.count).toBe(2)
    expect(library?.count).toBe(2)
    expect(beach!.rate).toBe(1)
    expect(library!.rate).toBe(0)
    expect(beach!.rate).toBeGreaterThan(library!.rate)

    const parts = successByDaypart(rows)
    const nightRow = parts.find((d) => d.label === 'Night')
    const morningRow = parts.find((d) => d.label === 'Morning')
    expect(nightRow?.count).toBe(2)
    expect(morningRow?.count).toBe(2)
    expect(nightRow!.rate).toBeGreaterThan(morningRow!.rate)
  })
})
