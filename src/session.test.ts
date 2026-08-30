import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { setApiKey } from './openai'
import { setToastListener } from './toast'
import {
  IDLE_STOP_MS,
  SessionRuntime,
  pickRecorderMime,
  resetSessionRuntime,
  shouldIdleStop,
  shouldSplitConversation,
  SILENCE_MS,
  startKeepAlive,
  stopKeepAlive,
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

  it('does not split before 60s', () => {
    expect(shouldSplitConversation(0, 59_999)).toBe(false)
  })

  it('splits at 60s of silence', () => {
    expect(shouldSplitConversation(1_000, 1_000 + SILENCE_MS)).toBe(true)
  })

  it('59s is false and 60s is true', () => {
    expect(shouldSplitConversation(0, 59_000)).toBe(false)
    expect(shouldSplitConversation(0, 60_000)).toBe(true)
  })

  it('SILENCE_MS is 60000', () => {
    expect(SILENCE_MS).toBe(60_000)
  })
})

describe('shouldIdleStop', () => {
  it('IDLE_STOP_MS is 600000', () => {
    expect(IDLE_STOP_MS).toBe(600_000)
  })

  it('9:59 is false and 10:00 is true from start with no speech', () => {
    expect(shouldIdleStop(null, 0, IDLE_STOP_MS - 1)).toBe(false)
    expect(shouldIdleStop(null, 0, IDLE_STOP_MS)).toBe(true)
  })

  it('speech at t=1min means stop at t=11min not t=10', () => {
    const start = 0
    const speech = 60_000
    expect(shouldIdleStop(speech, start, 10 * 60 * 1000)).toBe(false)
    expect(shouldIdleStop(speech, start, 11 * 60 * 1000)).toBe(true)
  })
})

describe('keepAlive', () => {
  it('start/stop does not throw', () => {
    expect(() => {
      startKeepAlive()
      stopKeepAlive()
    }).not.toThrow()
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
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().recording).toBe(false)
    await rt.start()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.getSnapshot().phase).toBe('live')
    expect(rt.getSnapshot().recording).toBe(true)
    await rt.stop()
    expect(rt.getSnapshot().phase).toBe('idle')
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

  it('emits phase starting before getUserMedia resolves, then live', async () => {
    let resolveGum!: (stream: MediaStream) => void
    const gumPromise = new Promise<MediaStream>((resolve) => {
      resolveGum = resolve
    })
    const getUserMedia = vi.fn(() => gumPromise)
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const started = rt.start()
    expect(rt.getSnapshot().phase).toBe('starting')
    expect(rt.getSnapshot().live).toBe(false)
    resolveGum(fakeStream())
    await started
    expect(rt.getSnapshot().phase).toBe('live')
    expect(rt.getSnapshot().live).toBe(true)
    await rt.stop()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
  })

  it('returns to idle with error when getUserMedia fails', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error('denied')
    })
    const rt = new SessionRuntime({
      getUserMedia,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(rt.getSnapshot().error).toMatch(/permission/i)
  })

  function runtime(now: () => number) {
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    return new SessionRuntime({
      now,
      getUserMedia: vi.fn(async () => fakeStream()),
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
  }

  it('idle-stops after 10 minutes with no speech from start', async () => {
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    let now = 1_000
    const rt = runtime(() => now)
    await rt.start()
    expect(rt.getSnapshot().phase).toBe('live')
    now = 1_000 + IDLE_STOP_MS - 1
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().phase).toBe('live')
    now = 1_000 + IDLE_STOP_MS
    expect(await rt.checkIdleStop(now)).toBe(true)
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(toasts).toContain('Stopped — no speech for 10 minutes.')
    setToastListener(null)
  })

  it('speech at 1min defers idle-stop to 11min; split does not reset the idle clock', async () => {
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    let now = 0
    const rt = runtime(() => now)
    await rt.start()
    expect(rt.getSnapshot().phase).toBe('live')
    now = 60_000
    rt.ingestSpeech('hello there how is the week going for you today really?', true, now)
    now = SILENCE_MS + 60_000
    expect(rt.checkSilence(now)).toBe(true)
    await rt.waitForBackground()
    expect(rt.getSnapshot().phase).toBe('live')
    now = 10 * 60 * 1000
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().phase).toBe('live')
    now = 11 * 60 * 1000
    expect(await rt.checkIdleStop(now)).toBe(true)
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(toasts).toContain('Stopped — no speech for 10 minutes.')
    await rt.start()
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
    expect(rt.getSnapshot().phase).toBe('idle')
    setToastListener(null)
  })
})
