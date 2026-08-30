import { describe, expect, it } from 'vitest'
import {
  analyzeTranscript,
  extractIntroName,
  pickOutcome,
  splitSentences,
} from './analyze'

const NUMBER_TALK = `Hey I'm Maya. What do you do? Here's my number 555-867-5309. Text me later.`
const DATE_TALK = `This is fun. Want to get coffee tomorrow? Let's meet at the park.`
const REJECT_TALK = `Gotta go, I have a boyfriend. No thanks.`
const SMALL = `Nice weather today.`
const LONG_TALK =
  'We talked about the weather and how the week has been going with no plans and no numbers just a long stretch of ordinary small talk about nothing in particular really going on around here today.'
const QUESTIONS = `What do you do? Where are you from? How's the food?`
const TOPICS =
  'I work in music and love travel. My family is in town. We went to a concert after class at school then grabbed dinner.'
const CHAT_TALK = `Great talking. Let's stay in touch. Talk later.`
const BOTH = `Coffee tomorrow? Here's my instagram @maya.field`

describe('analyzeTranscript fixtures', () => {
  it('got a number', () => {
    const a = analyzeTranscript(NUMBER_TALK, 80)
    expect(a.exchangedContact).toBe(true)
    expect(a.outcome).toBe('number')
    expect(a.followUpAt).toBeTruthy()
    expect(a.questionCount).toBeGreaterThanOrEqual(1)
    expect(a.commitments.some((c) => /text me/i.test(c))).toBe(true)
    expect(extractIntroName(NUMBER_TALK)).toBe('Maya')
  })

  it('got a date', () => {
    const a = analyzeTranscript(DATE_TALK, 60)
    expect(a.scheduled).toBe(true)
    expect(a.exchangedContact).toBe(false)
    expect(a.outcome).toBe('date')
    expect(a.followUpAt).toBeTruthy()
    expect(a.commitments.length).toBeGreaterThan(0)
  })

  it('rejection', () => {
    const a = analyzeTranscript(REJECT_TALK, 20)
    expect(a.outcome).toBe('no')
    expect(a.followUpAt).toBeNull()
  })

  it('small talk stays other', () => {
    const a = analyzeTranscript(SMALL, 12)
    expect(a.wordCount).toBeLessThan(30)
    expect(a.outcome).toBe('other')
    expect(a.followUpAt).toBeNull()
  })

  it('longer small talk is talked', () => {
    const a = analyzeTranscript(LONG_TALK, 90)
    expect(a.wordCount).toBeGreaterThanOrEqual(30)
    expect(a.outcome).toBe('talked')
  })

  it('counts questions', () => {
    const a = analyzeTranscript(QUESTIONS, 40)
    expect(a.questionCount).toBe(3)
  })

  it('topics hit keyword buckets only', () => {
    const a = analyzeTranscript(TOPICS, 50)
    expect(a.topics).toEqual(expect.arrayContaining(['work', 'music', 'travel', 'family', 'school', 'food']))
    expect(a.topics).not.toContain('nightlife')
  })

  it('stay in touch without contact is chat', () => {
    const a = analyzeTranscript(CHAT_TALK, 40)
    expect(a.exchangedContact).toBe(false)
    expect(a.outcome).toBe('chat')
  })

  it('number wins over date', () => {
    const a = analyzeTranscript(BOTH, 40)
    expect(a.exchangedContact).toBe(true)
    expect(a.scheduled).toBe(true)
    expect(a.outcome).toBe('number')
  })

  it('summary is first 180 chars', () => {
    const long = 'alpha '.repeat(50)
    const a = analyzeTranscript(long, 10)
    expect(a.summary.length).toBeLessThanOrEqual(180)
    expect(a.summary.endsWith('…')).toBe(true)
  })

  it('empty transcript summary', () => {
    expect(analyzeTranscript('', 0).summary).toBe('No speech captured.')
    expect(analyzeTranscript('   ', 12).summary).toMatch(/12s/)
  })
})

describe('pickOutcome order', () => {
  it('follows spec priority', () => {
    expect(
      pickOutcome({
        exchangedContact: true,
        scheduled: true,
        stayingInTouch: true,
        rejection: true,
        wordCount: 40,
      }),
    ).toBe('number')
    expect(
      pickOutcome({
        exchangedContact: false,
        scheduled: true,
        stayingInTouch: true,
        rejection: true,
        wordCount: 40,
      }),
    ).toBe('date')
    expect(
      pickOutcome({
        exchangedContact: false,
        scheduled: false,
        stayingInTouch: true,
        rejection: true,
        wordCount: 40,
      }),
    ).toBe('chat')
    expect(
      pickOutcome({
        exchangedContact: false,
        scheduled: false,
        stayingInTouch: false,
        rejection: true,
        wordCount: 40,
      }),
    ).toBe('no')
    expect(
      pickOutcome({
        exchangedContact: false,
        scheduled: false,
        stayingInTouch: false,
        rejection: false,
        wordCount: 30,
      }),
    ).toBe('talked')
    expect(
      pickOutcome({
        exchangedContact: false,
        scheduled: false,
        stayingInTouch: false,
        rejection: false,
        wordCount: 5,
      }),
    ).toBe('other')
  })
})

describe('splitSentences', () => {
  it('splits on punctuation', () => {
    expect(splitSentences('Hi. How are you? Fine!')).toHaveLength(3)
  })
})
