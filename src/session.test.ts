import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { setApiKey } from './openai'
import {
  SessionRuntime,
  pickRecorderMime,
  resetSessionRuntime,
  shouldSplitConversation,
  SILENCE_MS,
} from './session'
import * as understand from './understand'

beforeEach(async () => {
  resetSessionRuntime()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
    expect(row?.analysisSource).toBe('rules')
    expect(await db.sessions.count()).toBe(1)
    expect((await db.sessions.toCollection().first())?.endedAt).toBeTruthy()
  })

  it('does not call understand without an API key', async () => {
    const spy = vi.spyOn(understand, 'understandTranscript')
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
    rt.ingestSpeech('Hello there, how is the week going for you today really?', true)
    await rt.stop()
    await rt.waitForBackground()
    expect(spy).not.toHaveBeenCalled()
    expect((await db.approaches.toCollection().first())?.analysisSource).toBe('rules')
  })

  it('enriches with transcription then insight when a key is set', async () => {
    setApiKey('sk-test-field')
    const insight = {
      sentiment: 'positive',
      success: true,
      valence: 0.8,
      outcome: 'number',
      who: 'Maya',
      topics: ['work'],
      commitments: [],
      objections: [],
      questionsAsked: 1,
      energy: 'high',
      summary: 'Maya shared a number.',
      followUpSuggestion: 'Text Maya.',
      exchangedContact: true,
      scheduled: false,
      rejection: false,
      model: 'gpt-4o-mini',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/audio/transcriptions')) {
        return new Response('Whisper: Maya here is my number 555-1111.', { status: 200 })
      }
      if (url.includes('/chat/completions')) {
        return new Response(JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: JSON.stringify(insight) } }],
        }), { status: 200 })
      }
      return new Response('missing', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
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
    rt.ingestSpeech("Hey I'm Maya. Here's my number.", true)
    await rt.stop()
    await rt.waitForBackground()
    const row = await db.approaches.toCollection().first()
    expect(row?.analysisSource).toBe('model')
    expect(row?.transcript).toMatch(/Whisper/)
    expect(row?.insight?.who).toBe('Maya')
    expect(row?.insight?.success).toBe(true)
    vi.unstubAllGlobals()
  })
})
