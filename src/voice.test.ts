import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  VOICE_MATCH_MIN,
  VOICE_PROFILE_ID,
  clearVoiceProfile,
  cosSim,
  embeddingMatches,
  getVoiceProfile,
  hasVoiceEnrollment,
  setVoiceProfile,
  setVoiceTestHooks,
  setVerifyVoice,
  verifyVoice,
} from './voice'

beforeEach(async () => {
  setVoiceTestHooks(null)
  await db.voiceProfile.clear()
})

describe('cosSim', () => {
  it('is 1 for identical vectors', () => {
    expect(cosSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
    expect(cosSim([0.2, 0.4, 0.4], [0.2, 0.4, 0.4])).toBeCloseTo(1)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosSim([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('is -1 for opposite vectors', () => {
    expect(cosSim([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('returns 0 for empty or zero vectors', () => {
    expect(cosSim([], [])).toBe(0)
    expect(cosSim([0, 0], [0, 0])).toBe(0)
  })
})

describe('embeddingMatches threshold', () => {
  it('VOICE_MATCH_MIN is 0.75', () => {
    expect(VOICE_MATCH_MIN).toBe(0.75)
  })

  it('keeps when similarity is at or above threshold', () => {
    const enrolled = [1, 0, 0]
    const close = [0.8, 0.6, 0]
    expect(cosSim(close, enrolled)).toBeGreaterThan(VOICE_MATCH_MIN)
    expect(embeddingMatches(close, enrolled)).toBe(true)
    expect(embeddingMatches(enrolled, enrolled)).toBe(true)
  })

  it('drops when similarity is below threshold', () => {
    const enrolled = [1, 0, 0]
    const other = [0, 1, 0]
    expect(cosSim(other, enrolled)).toBeLessThan(VOICE_MATCH_MIN)
    expect(embeddingMatches(other, enrolled)).toBe(false)
    const borderline = [0.6, 0.8, 0]
    expect(cosSim(borderline, enrolled)).toBeLessThan(VOICE_MATCH_MIN)
    expect(embeddingMatches(borderline, enrolled)).toBe(false)
  })
})

describe('voice enrollment store', () => {
  it('get/set/clear the enrolled embedding', async () => {
    expect(await hasVoiceEnrollment()).toBe(false)
    expect(await getVoiceProfile()).toBeUndefined()
    await setVoiceProfile([0.1, 0.2, 0.3], new Blob(['wav'], { type: 'audio/webm' }))
    expect(await hasVoiceEnrollment()).toBe(true)
    const row = await getVoiceProfile()
    expect(row?.id).toBe(VOICE_PROFILE_ID)
    expect(row?.embedding).toEqual([0.1, 0.2, 0.3])
    expect(row?.audio).toBeTruthy()
    await clearVoiceProfile()
    expect(await hasVoiceEnrollment()).toBe(false)
    expect(await getVoiceProfile()).toBeUndefined()
  })
})

describe('verifyVoice injection', () => {
  it('uses the injected matcher without loading the model', async () => {
    setVerifyVoice(async (clip, enrolled) => embeddingMatches(clip, enrolled))
    const enrolled = new Float32Array([1, 0])
    await expect(verifyVoice(new Float32Array([1, 0]), enrolled)).resolves.toBe(true)
    await expect(verifyVoice(new Float32Array([0, 1]), enrolled)).resolves.toBe(false)
  })
})
