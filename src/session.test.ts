import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { setApiKey } from './openai'
import { setToastListener } from './toast'
import {
  GUM_TIMEOUT_MS,
  IDLE_STOP_MS,
  MIC_BLOCKED_ERROR,
  RESUME_DEBOUNCE_MS,
  RESUME_NOTE_CONTINUED,
  RESUME_NOTE_RESTARTED,
  SPEECH_NOTE_CAPTIONS_PAUSED,
  SPEECH_NOTE_DENIED,
  SPEECH_RETRY_FIRST_MS,
  SPEECH_RETRY_MAX,
  SPEECH_RETRY_NEXT_MS,
  SessionRuntime,
  keepAliveAudioAttempted,
  keepAliveStarters,
  pickRecorderMime,
  resetSessionRuntime,
  shouldIdleStop,
  shouldStartKeepAliveAudio,
  shouldSplitConversation,
  SILENCE_MS,
  startKeepAlive,
  stopKeepAlive,
  ENERGY_SAMPLE_SEC,
  LOUD_OPEN_SEC,
  NEAR_FIELD_RMS,
} from './session'
import * as understand from './understand'
import * as transcribe from './transcribe'
import { setIdleStopMs, setPauseMs } from './timing'
import { ENROLL_TOAST, setVoiceTestHooks } from './voice'

const KEEP_TALK = "Hey I'm Maya. What do you do? Here's my number 555-867-5309."

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state === 'hidden',
  })
}

beforeEach(async () => {
  resetSessionRuntime()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setVisibility('visible')
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    writable: true,
    value: undefined,
  })
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
  await db.voiceProfile.clear()
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

  it('custom gapMs 30000 splits at 30s not 60s', () => {
    expect(shouldSplitConversation(0, 29_999, 30_000)).toBe(false)
    expect(shouldSplitConversation(0, 30_000, 30_000)).toBe(true)
    expect(shouldSplitConversation(0, 59_000, 30_000)).toBe(true)
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

  it('idleMs 0 never stops', () => {
    expect(shouldIdleStop(null, 0, 0, 0)).toBe(false)
    expect(shouldIdleStop(null, 0, 1_000_000, 0)).toBe(false)
    expect(shouldIdleStop(60_000, 0, 1_000_000, 0)).toBe(false)
  })
})

describe('keepAlive', () => {
  it('start/stop does not throw', () => {
    expect(() => {
      startKeepAlive()
      stopKeepAlive()
    }).not.toThrow()
  })

  it('attempts audio element even if oscillator started', () => {
    class FakeOsc {
      frequency = { value: 0 }
      connect() {
        return this
      }
      start() {}
      stop() {}
    }
    class FakeGain {
      gain = { value: 0 }
      connect() {
        return this
      }
    }
    class FakeAC {
      destination = {}
      createOscillator() {
        return new FakeOsc()
      }
      createGain() {
        return new FakeGain()
      }
      resume() {
        return Promise.resolve()
      }
      close() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('AudioContext', FakeAC)

    const AudioSpy = vi.fn(function FakeAudio() {
      return {
        loop: false,
        volume: 1,
        playsInline: false,
        setAttribute() {},
        play: () => Promise.resolve(),
        pause() {},
        removeAttribute() {},
        load() {},
      }
    })
    vi.stubGlobal('Audio', AudioSpy)

    const osc = vi.spyOn(keepAliveStarters, 'oscillator')
    const el = vi.spyOn(keepAliveStarters, 'element')

    startKeepAlive()
    expect(osc).toHaveBeenCalled()
    expect(el).toHaveBeenCalled()
    expect(keepAliveAudioAttempted).toBe(true)
    expect(shouldStartKeepAliveAudio()).toBe(true)
    // MODE==='test' skips `new Audio()` so AudioSpy may not run; that's ok.
    void AudioSpy
    stopKeepAlive()
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
  timeslice: number | undefined
  ondataavailable: ((ev: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start(timeslice?: number) {
    this.timeslice = timeslice
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
  pause() {
    if (this.state === 'recording') this.state = 'paused'
  }
  resume() {
    if (this.state === 'paused') this.state = 'recording'
  }
}

function fakeStream(stop: () => void = () => {}, readyState = 'live'): MediaStream {
  return { getTracks: () => [{ stop, readyState, onended: null }] } as unknown as MediaStream
}

function stubMicPermission(state: PermissionState | 'throw' | null) {
  if (state === null) {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    })
    return vi.fn()
  }
  const query = vi.fn(async () => {
    if (state === 'throw') throw new Error('unsupported')
    return { state: state as PermissionState }
  })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query },
  })
  return query
}

function pendingGum() {
  let resolveGum!: (stream: MediaStream) => void
  let rejectGum!: (err: unknown) => void
  const promise = new Promise<MediaStream>((resolve, reject) => {
    resolveGum = resolve
    rejectGum = reject
  })
  return {
    getUserMedia: vi.fn(() => promise),
    resolve: (stream = fakeStream()) => resolveGum(stream),
    reject: (err: unknown) => rejectGum(err),
  }
}

function recCtor() {
  return vi.fn(function Rec() {
    return new FakeRecorder()
  }) as unknown as new (s: MediaStream) => FakeRecorder
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
    let now = 1_000
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    now += 12_000
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
    let now = 1_000
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech('Hello there, how is the week going for you today really?', true)
    rt.addLoudSec(3)
    now += 12_000
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
      isPickupAttempt: true,
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
    let now = 1_000
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    now += 12_000
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
    await flush()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
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
    expect(rt.getSnapshot().error).toBe(MIC_BLOCKED_ERROR)
  })

  it('GUM_TIMEOUT_MS is 8000', () => {
    expect(GUM_TIMEOUT_MS).toBe(8_000)
  })

  it('start while starting is a no-op', async () => {
    const gum = pendingGum()
    const rt = new SessionRuntime({
      getUserMedia: gum.getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const first = rt.start()
    expect(rt.getSnapshot().phase).toBe('starting')
    await flush()
    await rt.start()
    expect(gum.getUserMedia).toHaveBeenCalledTimes(1)
    expect(rt.getSnapshot().phase).toBe('starting')
    gum.resolve()
    await first
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
  })

  it('gum that never resolves goes idle after GUM_TIMEOUT_MS; late resolve is ignored', async () => {
    vi.useFakeTimers()
    const stop = vi.fn()
    const stream = fakeStream(stop)
    const gum = pendingGum()
    const rt = new SessionRuntime({
      getUserMedia: gum.getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const started = rt.start()
    expect(rt.getSnapshot().phase).toBe('starting')
    await vi.advanceTimersByTimeAsync(0)
    expect(gum.getUserMedia).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(GUM_TIMEOUT_MS - 1)
    expect(rt.getSnapshot().phase).toBe('starting')
    await vi.advanceTimersByTimeAsync(1)
    await started
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(rt.getSnapshot().error).toBe(MIC_BLOCKED_ERROR)
    gum.resolve(stream)
    await Promise.resolve()
    await Promise.resolve()
    expect(stop).toHaveBeenCalled()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    vi.useRealTimers()
  })

  it('permissions.query denied fails even if gum is already in flight', async () => {
    const query = stubMicPermission('denied')
    const gum = pendingGum()
    const rt = new SessionRuntime({
      getUserMedia: gum.getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const started = rt.start()
    expect(gum.getUserMedia).toHaveBeenCalledTimes(1)
    await started
    expect(query).toHaveBeenCalled()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(rt.getSnapshot().error).toBe(MIC_BLOCKED_ERROR)
  })

  it('permissions.query throw is skipped and gum still runs', async () => {
    stubMicPermission('throw')
    const getUserMedia = vi.fn(async () => fakeStream())
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
  })

  it('stop during starting returns idle and ignores late gum', async () => {
    const stop = vi.fn()
    const stream = fakeStream(stop)
    const gum = pendingGum()
    const rt = new SessionRuntime({
      getUserMedia: gum.getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const started = rt.start()
    expect(rt.getSnapshot().phase).toBe('starting')
    await flush()
    expect(gum.getUserMedia).toHaveBeenCalledTimes(1)
    await rt.stop()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
    expect(rt.getSnapshot().error).toBe(null)
    gum.resolve(stream)
    await started
    await Promise.resolve()
    await Promise.resolve()
    expect(stop).toHaveBeenCalled()
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().live).toBe(false)
  })

  it('retry after timeout starts from idle', async () => {
    vi.useFakeTimers()
    const gum = pendingGum()
    const getUserMedia = vi.fn(() => gum.getUserMedia())
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: recCtor() as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const started = rt.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(GUM_TIMEOUT_MS)
    await started
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(rt.getSnapshot().error).toBe(MIC_BLOCKED_ERROR)
    vi.useRealTimers()
    getUserMedia.mockImplementation(async () => fakeStream())
    await rt.start()
    expect(rt.getSnapshot().phase).toBe('live')
    expect(rt.getSnapshot().error).toBe(null)
    await rt.stop()
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
    rt.addLoudSec(3)
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

  it('checkSilence uses pauseMs pref: true at 30s not 29s', async () => {
    setPauseMs(30_000)
    let now = 0
    const rt = runtime(() => now)
    await rt.start()
    now = 10_000
    rt.ingestSpeech('hello there how is the week going for you today really?', true, now)
    rt.addLoudSec(3)
    now = 10_000 + 29_000
    expect(rt.checkSilence(now)).toBe(false)
    now = 10_000 + 30_000
    expect(rt.checkSilence(now)).toBe(true)
    await rt.stop()
  })

  it('checkIdleStop never true when idleStop is Off', async () => {
    setIdleStopMs(0)
    let now = 0
    const rt = runtime(() => now)
    await rt.start()
    now = 60 * 60 * 1000
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
  })

  it('idle-stops after 5 minutes when pref is 5min', async () => {
    setIdleStopMs(5 * 60 * 1000)
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    let now = 1_000
    const rt = runtime(() => now)
    await rt.start()
    now = 1_000 + 5 * 60 * 1000 - 1
    expect(await rt.checkIdleStop(now)).toBe(false)
    now = 1_000 + 5 * 60 * 1000
    expect(await rt.checkIdleStop(now)).toBe(true)
    expect(rt.getSnapshot().phase).toBe('idle')
    expect(toasts).toContain('Stopped — no speech for 5 minutes.')
    setToastListener(null)
  })

  it('checkIdleStop is false when document is hidden even after 10 min', async () => {
    let now = 1_000
    const rt = runtime(() => now)
    await rt.start()
    setVisibility('hidden')
    now = 1_000 + IDLE_STOP_MS
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
  })

  it('stays live after hidden then visible despite 10+ min wall clock', async () => {
    let now = 1_000
    const rt = runtime(() => now)
    await rt.start()
    expect(rt.getSnapshot().live).toBe(true)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    now = 1_000 + IDLE_STOP_MS + 60_000
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().live).toBe(true)

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.getSnapshot().phase).toBe('live')
    await rt.stop()
  })

  it('handleResume restarts recorder when state is inactive', async () => {
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    })
    const getUserMedia = vi.fn(async () => fakeStream())
    const rt = new SessionRuntime({
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    expect(rt.getSnapshot().recording).toBe(true)
    expect(Rec).toHaveBeenCalledTimes(1)
    const rec = Rec.mock.results[0].value as FakeRecorder
    rec.state = 'inactive'

    vi.useFakeTimers()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    rec.state = 'inactive'

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(RESUME_DEBOUNCE_MS)
    await flush()
    vi.useRealTimers()

    expect(Rec.mock.calls.length).toBeGreaterThanOrEqual(2)
    const rec2 = Rec.mock.results[Rec.mock.results.length - 1].value as FakeRecorder
    expect(rec2.state).toBe('recording')
    expect(rt.getSnapshot().recording).toBe(true)
    expect(rt.getSnapshot().live).toBe(true)
    await rt.stop()
  })
})

class FakeSpeechRec {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null =
    null
  onend: (() => void) | null = null
  onerror: ((ev: { error: string }) => void) | null = null
  start = vi.fn(() => {})
  stop = vi.fn(() => {
    this.onend?.()
  })
}

function speechHarness() {
  const instances: FakeSpeechRec[] = []
  const Ctor = vi.fn(function Speech() {
    const rec = new FakeSpeechRec()
    instances.push(rec)
    return rec
  })
  return {
    Ctor: Ctor as unknown as new () => FakeSpeechRec,
    instances,
    startCount: () => instances.reduce((n, r) => n + r.start.mock.calls.length, 0),
  }
}

function hideApp() {
  setVisibility('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
}

function showApp() {
  setVisibility('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

async function advanceResume() {
  await vi.advanceTimersByTimeAsync(RESUME_DEBOUNCE_MS)
  await flush()
}

function liveRuntime(over: ConstructorParameters<typeof SessionRuntime>[0] = {}) {
  const Rec = vi.fn(function Rec() {
    return new FakeRecorder()
  })
  const speech = Object.prototype.hasOwnProperty.call(over, 'SpeechRecognition')
    ? null
    : speechHarness()
  const getUserMedia = over.getUserMedia ?? vi.fn(async () => fakeStream())
  let now = 1_000
  const advance = (ms: number) => {
    now += ms
  }
  const rt = new SessionRuntime({
    now: () => now,
    getUserMedia,
    MediaRecorder: Rec as never,
    SpeechRecognition: speech?.Ctor as never,
    geolocation: null,
    ...over,
  })
  return { rt, Rec, speech, getUserMedia, advance }
}


function watchAudioAdds() {
  const blobs: Blob[] = []
  const orig = db.audioClips.add.bind(db.audioClips)
  vi.spyOn(db.audioClips, 'add').mockImplementation((row) => {
    blobs.push((row as { blob: Blob }).blob)
    return orig(row)
  })
  return blobs
}

async function blobText(blob: Blob): Promise<string> {
  if (blob && typeof (blob as Blob).arrayBuffer === 'function') {
    return new TextDecoder().decode(await blob.arrayBuffer())
  }
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(blob)
  })
}

describe('leave/resume recording + speech', () => {
  it('hide pauses speech but does not stop MediaRecorder or clear recording', async () => {
    const { rt, Rec, speech } = liveRuntime()
    await rt.start()
    const rec = Rec.mock.results[0].value as FakeRecorder
    const recStop = vi.spyOn(rec, 'stop')
    const recPause = vi.spyOn(rec, 'pause')
    expect(rec.timeslice).toBe(1000)
    expect(rt.getSnapshot().recording).toBe(true)
    expect(speech!.startCount()).toBe(1)

    hideApp()

    expect(recStop).not.toHaveBeenCalled()
    expect(recPause).not.toHaveBeenCalled()
    expect(rec.state).toBe('recording')
    expect(rt.getSnapshot().recording).toBe(true)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.wantsRecognition()).toBe(true)
    expect(speech!.instances[0].stop).toHaveBeenCalled()
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(String(rt.getSnapshot().speechNote ?? '')).not.toMatch(/permission denied/i)
    await rt.stop()
  })

  it('onend while hidden does not call SpeechRecognition.start until visible', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    vi.useFakeTimers()
    hideApp()
    const starts = speech!.startCount()
    speech!.instances[0].onend?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(speech!.startCount()).toBe(starts)
    expect(rt.wantsRecognition()).toBe(true)
    vi.useRealTimers()
    await rt.stop()
  })

  it('hidden then visible starts recognition after debounce', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    expect(speech!.startCount()).toBe(1)
    vi.useFakeTimers()
    hideApp()
    expect(speech!.instances.length).toBe(1)
    showApp()
    await vi.advanceTimersByTimeAsync(RESUME_DEBOUNCE_MS - 1)
    expect(speech!.instances.length).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(speech!.instances.length).toBe(2)
    expect(speech!.instances[1].start).toHaveBeenCalled()
    expect(rt.getSnapshot().recording).toBe(true)
    vi.useRealTimers()
    await rt.stop()
  })

  it('not-allowed while hidden does not set speechNote and keeps wantRecognition', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    hideApp()
    speech!.instances[0].onerror?.({ error: 'not-allowed' })
    speech!.instances[0].onend?.()
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    speech!.instances[0].onerror?.({ error: 'service-not-allowed' })
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    await rt.stop()
  })

  it('not-allowed on resume while stream live retries without permission denied', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    vi.useFakeTimers()
    hideApp()
    showApp()
    await advanceResume()
    expect(speech!.instances.length).toBe(2)
    const rec2 = speech!.instances[1]
    rec2.onerror?.({ error: 'not-allowed' })
    rec2.onend?.()
    expect(rt.getSnapshot().speechNote).not.toBe(SPEECH_NOTE_DENIED)
    expect(String(rt.getSnapshot().speechNote ?? '')).not.toMatch(/permission denied/i)
    expect(rt.wantsRecognition()).toBe(true)
    await vi.advanceTimersByTimeAsync(SPEECH_RETRY_FIRST_MS)
    await flush()
    expect(speech!.instances.length).toBe(3)
    const rec3 = speech!.instances[2]
    rec3.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'hello there how is the week going for you today really?' } }],
    })
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    vi.useRealTimers()
    await rt.stop()
  })

  it('not-allowed retries exhaust to a soft captions note, not permission denied', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    const fireDenied = async () => {
      const rec = speech!.instances[speech!.instances.length - 1]
      rec.onerror?.({ error: 'not-allowed' })
      rec.onend?.()
      await flush()
    }
    vi.useFakeTimers()
    await fireDenied()
    for (let i = 0; i < SPEECH_RETRY_MAX; i += 1) {
      const delay = i === 0 ? SPEECH_RETRY_FIRST_MS : SPEECH_RETRY_NEXT_MS
      await vi.advanceTimersByTimeAsync(delay)
      await flush()
      await fireDenied()
    }
    expect(rt.getSnapshot().speechNote).toBe(SPEECH_NOTE_CAPTIONS_PAUSED)
    expect(rt.getSnapshot().speechNote).not.toBe(SPEECH_NOTE_DENIED)
    expect(rt.wantsRecognition()).toBe(true)
    vi.useRealTimers()
    await rt.stop()
  })

  it('aborted and no-speech do not set denied note', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    const rec = speech!.instances[0]
    rec.onerror?.({ error: 'aborted' })
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    rec.onerror?.({ error: 'no-speech' })
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    rec.onerror?.({ error: 'network' })
    expect(rt.getSnapshot().speechNote).toBe(null)
    expect(rt.wantsRecognition()).toBe(true)
    expect(String(rt.getSnapshot().speechNote ?? '')).not.toMatch(/permission denied/i)
    await rt.stop()
  })

  it('pageshow + visibility visible close together start recognition at most once', async () => {
    const { rt, speech } = liveRuntime()
    await rt.start()
    vi.useFakeTimers()
    hideApp()
    const before = speech!.startCount()
    showApp()
    window.dispatchEvent(new Event('pageshow'))
    await advanceResume()
    expect(speech!.startCount() - before).toBeLessThanOrEqual(1)
    expect(speech!.startCount() - before).toBe(1)
    vi.useRealTimers()
    await rt.stop()
  })

  it('idle-stop is skipped while hidden', async () => {
    let now = 1_000
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    })
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia: vi.fn(async () => fakeStream()),
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    hideApp()
    now = 1_000 + IDLE_STOP_MS
    expect(await rt.checkIdleStop(now)).toBe(false)
    expect(rt.getSnapshot().live).toBe(true)
    expect(rt.getSnapshot().recording).toBe(true)
    await rt.stop()
  })

  it('resume with inactive recorder continues capturing without wiping pre-leave chunks', async () => {
    const saved = watchAudioAdds()
    const { rt, Rec, advance } = liveRuntime({ SpeechRecognition: null })
    await rt.start()
    rt.ingestSpeech('hello there how is the week going for you today really?', true)
    rt.addLoudSec(3)
    advance(12_000)
    const rec = Rec.mock.results[0].value as FakeRecorder
    rec.ondataavailable?.({ data: new Blob(['PRELEAVE'], { type: 'audio/webm' }) })
    const recStop = vi.spyOn(rec, 'stop')
    vi.useFakeTimers()
    hideApp()
    expect(recStop).not.toHaveBeenCalled()
    rec.state = 'inactive'
    showApp()
    await advanceResume()
    expect(Rec.mock.calls.length).toBeGreaterThanOrEqual(2)
    const rec2 = Rec.mock.results[Rec.mock.results.length - 1].value as FakeRecorder
    expect(rec2.state).toBe('recording')
    expect(rec2.timeslice).toBe(1000)
    expect(rt.getSnapshot().recording).toBe(true)
    expect(rt.getSnapshot().resumeNote).toBe(RESUME_NOTE_RESTARTED)
    expect(String(rt.getSnapshot().resumeNote ?? '')).not.toMatch(/may have stopped/i)
    rec2.ondataavailable?.({ data: new Blob(['POST'], { type: 'audio/webm' }) })
    vi.useRealTimers()
    await rt.stop()
    expect(saved.length).toBeGreaterThan(0)
    const text = await blobText(saved[0])
    expect(text).toContain('PRELEAVE')
    expect(text).toContain('POST')
  })

  it('paused recorder is resume()d not replaced', async () => {
    const { rt, Rec } = liveRuntime({ SpeechRecognition: null })
    await rt.start()
    const rec = Rec.mock.results[0].value as FakeRecorder
    const resume = vi.spyOn(rec, 'resume')
    rec.state = 'paused'
    vi.useFakeTimers()
    hideApp()
    showApp()
    await advanceResume()
    expect(resume).toHaveBeenCalled()
    expect(Rec).toHaveBeenCalledTimes(1)
    expect(rec.state).toBe('recording')
    expect(rt.getSnapshot().recording).toBe(true)
    expect(rt.getSnapshot().resumeNote).toBe(RESUME_NOTE_CONTINUED)
    vi.useRealTimers()
    await rt.stop()
  })

  it('hide does not stop keep-alive starters', async () => {
    const osc = vi.spyOn(keepAliveStarters, 'oscillator')
    const el = vi.spyOn(keepAliveStarters, 'element')
    const { rt, Rec } = liveRuntime({ SpeechRecognition: null })
    await rt.start()
    osc.mockClear()
    el.mockClear()
    const rec = Rec.mock.results[0].value as FakeRecorder
    const recStop = vi.spyOn(rec, 'stop')
    hideApp()
    expect(recStop).not.toHaveBeenCalled()
    expect(osc).not.toHaveBeenCalled()
    expect(el).not.toHaveBeenCalled()
    expect(rt.getSnapshot().recording).toBe(true)
    await rt.stop()
  })

  it('ended tracks on resume re-getUserMedia and keep chunks', async () => {
    const saved = watchAudioAdds()
    const track = { stop: vi.fn(), readyState: 'live', onended: null as (() => void) | null }
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    })
    let now = 1_000
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia,
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech('hello there how is the week going for you today really?', true)
    rt.addLoudSec(3)
    now += 12_000
    const rec = Rec.mock.results[0].value as FakeRecorder
    rec.ondataavailable?.({ data: new Blob(['PRELEAVE'], { type: 'audio/webm' }) })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    track.readyState = 'ended'
    rec.state = 'inactive'
    const stream2 = fakeStream()
    getUserMedia.mockImplementation(async () => stream2)
    vi.useFakeTimers()
    hideApp()
    showApp()
    await advanceResume()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(rt.getSnapshot().recording).toBe(true)
    vi.useRealTimers()
    await rt.stop()
    expect(saved.length).toBeGreaterThan(0)
    const text = await blobText(saved[0])
    expect(text).toContain('PRELEAVE')
  })
})


describe('clip keep gate + near-field energy', () => {
  function gatedRuntime() {
    let now = 1_000
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia: vi.fn(async () => fakeStream()),
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    return {
      rt,
      Rec,
      advance: (ms: number) => {
        now += ms
      },
    }
  }

  it('energy blip rms 0.05 does not open a conversation', async () => {
    const { rt, advance } = gatedRuntime()
    await rt.start()
    expect(rt.hasOpenConversation()).toBe(false)
    expect(rt.getSnapshot().recording).toBe(true)
    rt.sampleEnergy(0.05)
    expect(rt.hasOpenConversation()).toBe(false)
    expect(rt.getLoudSecForTest()).toBe(0)
    advance(IDLE_STOP_MS)
    expect(await rt.checkIdleStop()).toBe(true)
    expect(await db.approaches.count()).toBe(0)
  })

  it('loud frames accumulate loudSec and open after ~1.5s', async () => {
    const { rt } = gatedRuntime()
    await rt.start()
    const framesToOpen = Math.ceil(LOUD_OPEN_SEC / ENERGY_SAMPLE_SEC)
    for (let i = 0; i < framesToOpen - 1; i += 1) {
      rt.sampleEnergy(NEAR_FIELD_RMS + 0.01)
    }
    expect(rt.hasOpenConversation()).toBe(false)
    expect(rt.getLoudSecForTest()).toBeCloseTo((framesToOpen - 1) * ENERGY_SAMPLE_SEC)
    rt.sampleEnergy(NEAR_FIELD_RMS + 0.01)
    expect(rt.hasOpenConversation()).toBe(true)
    expect(rt.getLoudSecForTest()).toBeCloseTo(framesToOpen * ENERGY_SAMPLE_SEC)
    rt.sampleEnergy(NEAR_FIELD_RMS + 0.01)
    expect(rt.getLoudSecForTest()).toBeCloseTo((framesToOpen + 1) * ENERGY_SAMPLE_SEC)
    await rt.stop()
  })

  it('closeConversation does not put a DB row when the cheap gate fails', async () => {
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech('hi there friend', true)
    expect(rt.hasOpenConversation()).toBe(true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    expect(await db.approaches.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
  })

  it('puts a row when duration, words, and loudSec all pass', async () => {
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    expect(await db.approaches.count()).toBe(1)
    expect(await db.audioClips.count()).toBe(1)
  })

  it('drops the approach when GPT says isPickupAttempt false', async () => {
    setApiKey('sk-test-field')
    vi.spyOn(transcribe, 'transcribeAudio').mockResolvedValue(KEEP_TALK)
    vi.spyOn(understand, 'understandTranscript').mockResolvedValue({
      ...understand.emptyInsight(),
      isPickupAttempt: false,
      summary: 'Ambient crowd, not an approach.',
    })
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    await rt.waitForBackground()
    expect(await db.approaches.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
    expect(toasts).not.toContain('Could not understand this conversation')
    expect(toasts.filter((t) => /drop|crowd|approach/i.test(t))).toEqual([])
    setToastListener(null)
  })

  it('does not write a row when voice is not enrolled', async () => {
    setVoiceTestHooks({ enrolled: false, match: true })
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    await rt.waitForBackground()
    expect(await db.approaches.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
    expect(toasts).toContain(ENROLL_TOAST)
    setToastListener(null)
  })

  it('toasts enroll once when several clips close without enrollment', async () => {
    setVoiceTestHooks({ enrolled: false, match: true })
    setPauseMs(10_000)
    const toasts: string[] = []
    setToastListener((m) => toasts.push(m))
    let now = 1_000
    const Rec = vi.fn(function Rec() {
      return new FakeRecorder()
    }) as unknown as new (s: MediaStream) => FakeRecorder
    const rt = new SessionRuntime({
      now: () => now,
      getUserMedia: vi.fn(async () => fakeStream()),
      MediaRecorder: Rec as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    now += 12_000
    expect(rt.checkSilence(now)).toBe(true)
    await rt.waitForBackground()
    now += 1_000
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    now += 12_000
    await rt.stop()
    await rt.waitForBackground()
    expect(await db.approaches.count()).toBe(0)
    expect(toasts.filter((m) => m === ENROLL_TOAST)).toHaveLength(1)
    setToastListener(null)
  })

  it('does not write a row when voiceMatch is false', async () => {
    setVoiceTestHooks({ enrolled: true, match: false })
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    await rt.waitForBackground()
    expect(await db.approaches.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
  })

  it('keeps the row when voice matches and GPT says isPickupAttempt true', async () => {
    setVoiceTestHooks({ enrolled: true, match: true })
    setApiKey('sk-test-field')
    vi.spyOn(transcribe, 'transcribeAudio').mockResolvedValue(KEEP_TALK)
    vi.spyOn(understand, 'understandTranscript').mockResolvedValue({
      ...understand.emptyInsight(),
      isPickupAttempt: true,
      who: 'Maya',
      summary: 'Asked Maya out and got her number.',
    })
    const { rt, advance } = gatedRuntime()
    await rt.start()
    rt.ingestSpeech(KEEP_TALK, true)
    rt.addLoudSec(3)
    advance(12_000)
    await rt.stop()
    await rt.waitForBackground()
    expect(await db.approaches.count()).toBe(1)
    expect(await db.audioClips.count()).toBe(1)
    expect((await db.approaches.toCollection().first())?.insight?.isPickupAttempt).toBe(true)
  })
})
