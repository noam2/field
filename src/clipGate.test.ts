import { describe, expect, it } from 'vitest'
import {
  MIN_KEEP_DURATION_SEC,
  MIN_KEEP_WORDS,
  MIN_LOUD_SEC,
  clipWordCount,
  shouldKeepClip,
} from './clipGate'

describe('clipGate constants', () => {
  it('exports keep thresholds', () => {
    expect(MIN_KEEP_DURATION_SEC).toBe(8)
    expect(MIN_KEEP_WORDS).toBe(8)
    expect(MIN_LOUD_SEC).toBe(2)
  })
})

describe('clipWordCount', () => {
  it('counts Hebrew words on whitespace', () => {
    expect(clipWordCount('שלום מה נשמע היום איתך הכל בסדר גמור')).toBe(8)
  })

  it('empty and noise fail the word bar', () => {
    expect(clipWordCount('')).toBe(0)
    expect(clipWordCount('   ')).toBe(0)
    expect(clipWordCount('hmm')).toBe(1)
  })
})

describe('shouldKeepClip', () => {
  it('drops short clips', () => {
    expect(shouldKeepClip({ durationSec: 7, wordCount: 20, loudSec: 3 })).toBe(false)
  })

  it('drops few words', () => {
    expect(shouldKeepClip({ durationSec: 12, wordCount: 7, loudSec: 3 })).toBe(false)
  })

  it('drops quiet clips', () => {
    expect(shouldKeepClip({ durationSec: 12, wordCount: 20, loudSec: 1.9 })).toBe(false)
  })

  it('drops empty / noise transcripts via wordCount', () => {
    expect(
      shouldKeepClip({
        durationSec: 12,
        wordCount: clipWordCount(''),
        loudSec: 3,
      }),
    ).toBe(false)
    expect(
      shouldKeepClip({
        durationSec: 12,
        wordCount: clipWordCount('   hmm  '),
        loudSec: 3,
      }),
    ).toBe(false)
  })

  it('keeps 12s + 20 words + 3 loudSec', () => {
    expect(shouldKeepClip({ durationSec: 12, wordCount: 20, loudSec: 3 })).toBe(true)
  })

  it('keeps when Hebrew wordCount meets the bar', () => {
    const words = clipWordCount('שלום מה נשמע היום איתך הכל בסדר גמור')
    expect(words).toBeGreaterThanOrEqual(MIN_KEEP_WORDS)
    expect(shouldKeepClip({ durationSec: 12, wordCount: words, loudSec: 3 })).toBe(true)
  })
})
