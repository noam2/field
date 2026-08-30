import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  SessionRuntime,
  pickRecorderMime,
  resetSessionRuntime,
  shouldSplitConversation,
  SILENCE_MS,
} from './session'

beforeEach(async () => {
  resetSessionRuntime()
  localStorage.clear()
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
})

describe('shouldSplitConversation', () => {
  it('does not split when there has been no speech', () => {
    expect(shouldSplitConversation(null, 100_000)).toBe(false)
  })

  it('does not split before 45s', () => {
    expect(shouldSplitConversation(0, 44_999)).toBe(false)
  })

  it('splits at 45s of silence', () => {
    expect(shouldSplitConversation(1_000, 1_000 + SILENCE_MS)).toBe(true)
  })
})

describe('pickRecorderMime', () => {
  it('picks the first supported type', () => {
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns empty when none match', () => {
    expect(pickRecorderMime(() => false)).toBe('')
  })
})

class FakeRecorder {
  state = 'inactive'
  ondataavailable: ((ev: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop() {} }] } as unknown as MediaStream
}

describe('SessionRuntime', () => {
  it('does not record until start() is called', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(rt.getSnapshot().live).toBe(false)
    expect(rt.getSnapshot().recording).toBe(false)
    await rt.start()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.getSnapshot().recording).toBe(true)
    await rt.stop()
  })

  it('writes a conversation on stop after speech', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech("Hey I'm Maya. What do you do? Here's my number 555-867-5309.", true)
    await rt.stop()
    await expect(db.approaches.count()).resolves.toBe(1)
    const row = await db.approaches.toCollection().first()
    expect(row?.source).toBe('recording')
    expect(row?.outcome).toBe('number')
    expect(row?.who).toBe('Maya')
    expect(row?.transcript).toMatch(/555/)
    expect(await db.sessions.count()).toBe(1)
    expect((await db.sessions.toCollection().first())?.endedAt).toBeTruthy()
  })
})
