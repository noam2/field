import { analyzeTranscript, extractIntroName, tomorrowIso } from './analyze'
import { db } from './db'
import { getKeepAlive, speechRecognitionLang } from './lang'
import { hasApiKey } from './openai'
import { mergePlaceSignals } from './place'
import { toast } from './toast'
import { transcribeAudio } from './transcribe'
import { proofTranscript, understandTranscript } from './understand'
import { formatCoordPlace, nowISO } from './utils'
import type { Approach, SpokenLanguage, UnderstandContext } from './types'

export const SILENCE_MS = 60_000
export const IDLE_STOP_MS = 10 * 60 * 1000
export const PING_THROTTLE_MS = 10_000
export const GUM_TIMEOUT_MS = 8_000
/** One-line idle error when the site mic permission is blocked or getUserMedia hangs. */
export const MIC_BLOCKED_ERROR = 'Mic is blocked in Chrome site settings.'
export const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
]

export type Ping = {
  lat: number
  lng: number
  accuracy: number | null
  at: number
}

export type SessionPhase = 'idle' | 'starting' | 'live'

export type SessionSnapshot = {
  live: boolean
  phase: SessionPhase
  recording: boolean
  sessionId: string | null
  startedAtMs: number | null
  transcript: string
  interim: string
  conversationCount: number
  error: string | null
  speechAvailable: boolean
  speechNote: string | null
  lat: number | null
  lng: number | null
  accuracy: number | null
  place: string | null
  resumeNote: string | null
}

export type SpeechRecLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: SpeechRecResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

export type SpeechRecResultEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

type SpeechCtor = new () => SpeechRecLike

type RecorderLike = {
  state: string
  mimeType?: string
  ondataavailable: ((ev: { data: Blob }) => void) | null
  onstop: (() => void) | null
  start: (timeslice?: number) => void
  stop: () => void
}

type RecorderCtor = {
  new (stream: MediaStream, opts?: { mimeType?: string }): RecorderLike
  isTypeSupported?: (mime: string) => boolean
}

export type SessionDeps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  MediaRecorder?: RecorderCtor
  SpeechRecognition?: SpeechCtor | null
  geolocation?: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | null
  now?: () => number
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } | null
}

export type ReverseGeo = {
  name: string
  nominatimType?: string
  nominatimClass?: string
}

const placeCache = new Map<string, ReverseGeo>()

export function geoCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

type AudioCtxCtor = new () => AudioContext

function audioContextCtor(): AudioCtxCtor | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioCtxCtor
    webkitAudioContext?: AudioCtxCtor
  }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

let keepOsc: { ctx: AudioContext; osc: OscillatorNode } | null = null
let keepAudio: HTMLAudioElement | null = null

export function startKeepAlive(): void {
  stopKeepAlive()
  try {
    const AC = audioContextCtor()
    if (AC) {
      const ctx = new AC()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.frequency.value = 20
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      void ctx.resume?.()
      keepOsc = { ctx, osc }
    }
  } catch {
    keepOsc = null
  }
  if (keepOsc) return
  if (import.meta.env.MODE === 'test') return
  try {
    const el = new Audio(SILENT_WAV)
    el.loop = true
    el.volume = 0
    const play = el.play()
    if (play && typeof play.catch === 'function') void play.catch(() => {})
    keepAudio = el
  } catch {
    keepAudio = null
  }
}

export function stopKeepAlive(): void {
  try {
    keepOsc?.osc.stop()
  } catch {
    /* ignore */
  }
  try {
    void keepOsc?.ctx.close()
  } catch {
    /* ignore */
  }
  keepOsc = null
  try {
    if (keepAudio) {
      keepAudio.pause()
      keepAudio.removeAttribute('src')
      keepAudio.load()
    }
  } catch {
    /* ignore */
  }
  keepAudio = null
}

export function shouldSplitConversation(
  lastSpeechAt: number | null,
  now: number,
  gapMs = SILENCE_MS,
): boolean {
  if (lastSpeechAt == null) return false
  return now - lastSpeechAt >= gapMs
}

export function shouldIdleStop(
  lastSpeechAt: number | null,
  startedAtMs: number | null,
  now: number,
  idleMs = IDLE_STOP_MS,
): boolean {
  const last = lastSpeechAt ?? startedAtMs
  if (last == null) return false
  return now - last >= idleMs
}

export function pickRecorderMime(
  isTypeSupported: (mime: string) => boolean = (mime) => {
    const ctor = (
      globalThis as typeof globalThis & {
        MediaRecorder?: { isTypeSupported?: (m: string) => boolean }
      }
    ).MediaRecorder
    return ctor?.isTypeSupported?.(mime) === true
  },
): string {
  return RECORDER_MIME_CANDIDATES.find((m) => isTypeSupported(m)) ?? ''
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeo> {
  const key = geoCacheKey(lat, lng)
  const hit = placeCache.get(key)
  if (hit) return hit
  const fallback: ReverseGeo = { name: formatCoordPlace(lat, lng) }
  if (import.meta.env.MODE === 'test') {
    placeCache.set(key, fallback)
    return fallback
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Field/1.0 (consented study location log)',
      },
    })
    if (!res.ok) {
      placeCache.set(key, fallback)
      return fallback
    }
    const j = (await res.json()) as {
      name?: string
      display_name?: string
      address?: Record<string, string>
      type?: string
      class?: string
      namedetails?: Record<string, string>
    }
    const a = j.address ?? {}
    const bits = [
      a.amenity || a.shop || a.tourism || a.leisure || j.namedetails?.name || j.name,
      a.road,
      a.neighbourhood || a.suburb || a.village || a.town || a.city,
    ].filter(Boolean)
    const name =
      bits.join(', ') ||
      j.display_name?.split(',').slice(0, 2).join(',').trim() ||
      fallback.name
    const geo: ReverseGeo = {
      name,
      nominatimType: j.type,
      nominatimClass: j.class,
    }
    placeCache.set(key, geo)
    return geo
  } catch {
    placeCache.set(key, fallback)
    return fallback
  }
}

function getSpeechCtor(override?: SpeechCtor | null): SpeechCtor | null {
  if (override !== undefined) return override
  const w = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechCtor
    webkitSpeechRecognition?: SpeechCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const emptySnapshot = (): SessionSnapshot => ({
  live: false,
  phase: 'idle',
  recording: false,
  sessionId: null,
  startedAtMs: null,
  transcript: '',
  interim: '',
  conversationCount: 0,
  error: null,
  speechAvailable: false,
  speechNote: null,
  lat: null,
  lng: null,
  accuracy: null,
  place: null,
  resumeNote: null,
})

export class SessionRuntime {
  private listeners = new Set<() => void>()
  private snapshot: SessionSnapshot = emptySnapshot()
  private deps: SessionDeps
  private stream: MediaStream | null = null
  private recorder: RecorderLike | null = null
  private chunks: Blob[] = []
  private recognition: SpeechRecLike | null = null
  private wantRecognition = false
  private watchId: number | null = null
  private wake: { release: () => Promise<void> } | null = null
  private visibilityBound = false
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setInterval> | null = null
  private lastSpeechAt: number | null = null
  private lastActivityAt: number | null = null
  private idleStopping = false
  private startGen = 0
  private lastPingAt = 0
  private convId: string | null = null
  private convStartedMs: number | null = null
  private finalTranscript = ''
  private writeChain: Promise<void> = Promise.resolve()
  private enrichChain: Promise<void> = Promise.resolve()
  private mime = ''
  private geoType: string | null = null
  private geoClass: string | null = null
  private hiddenWhileLive = false
  private pageshowBound = false
  private energyTimer: ReturnType<typeof setInterval> | null = null
  private gumTimer: ReturnType<typeof setTimeout> | null = null
  private analyser: AnalyserNode | null = null
  private audioCtx: AudioContext | null = null
  private energySource: MediaStreamAudioSourceNode | null = null

  constructor(deps: SessionDeps = {}) {
    this.deps = deps
    const speech = getSpeechCtor(deps.SpeechRecognition)
    this.snapshot = {
      ...emptySnapshot(),
      speechAvailable: Boolean(speech),
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): SessionSnapshot => this.snapshot

  waitForBackground(): Promise<void> {
    return this.writeChain.then(() => this.enrichChain)
  }

  isLive(): boolean {
    return this.snapshot.live
  }

  private emit(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const fn of this.listeners) fn()
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  async start(): Promise<void> {
    if (this.snapshot.live || this.snapshot.phase === 'starting') return
    const gen = ++this.startGen
    this.emit({ phase: 'starting', error: null })
    const gum =
      this.deps.getUserMedia ??
      navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    if (!gum) {
      this.emit({ phase: 'idle', live: false, error: 'Microphone is not available on this device.' })
      return
    }

    // Call getUserMedia immediately — never wait on Permissions.query first.
    // Chrome still owns the OS grant; we cannot skip it. If already granted,
    // this resolves with no prompt. Denied/hang is handled in parallel.
    const gumPromise = gum({ audio: true, video: false })
    void gumPromise.then(
      (stream) => {
        if (gen !== this.startGen) this.haltStream(stream)
      },
      () => {
        /* reject handled by the race below */
      },
    )

    try {
      this.stream = await new Promise<MediaStream>((resolve, reject) => {
        this.clearGumTimer()
        this.gumTimer = setTimeout(() => {
          this.gumTimer = null
          reject(Object.assign(new Error('getUserMedia timed out'), { name: 'GumTimeoutError' }))
        }, GUM_TIMEOUT_MS)
        gumPromise.then(
          (stream) => {
            this.clearGumTimer()
            resolve(stream)
          },
          (err) => {
            this.clearGumTimer()
            reject(err)
          },
        )
        void this.microphoneDenied().then((denied) => {
          if (!denied || gen !== this.startGen) return
          this.clearGumTimer()
          reject(Object.assign(new Error('mic denied'), { name: 'NotAllowedError' }))
        })
      })
    } catch {
      if (gen !== this.startGen) return
      this.startGen += 1
      this.emit({
        phase: 'idle',
        live: false,
        error: MIC_BLOCKED_ERROR,
      })
      return
    }
    if (gen !== this.startGen) {
      this.stopStream()
      return
    }

    const id = crypto.randomUUID()
    const startedAt = nowISO()
    const startedAtMs = this.now()
    await db.sessions.add({ id, startedAt, endedAt: null })
    if (gen !== this.startGen) {
      this.stopStream()
      await db.sessions.update(id, { endedAt: nowISO() })
      return
    }

    this.finalTranscript = ''
    this.chunks = []
    this.conversationCountReset()
    this.lastSpeechAt = null
    this.lastActivityAt = null
    this.idleStopping = false
    this.convId = null
    this.convStartedMs = null
    this.mime = pickRecorderMime()
    this.geoType = null
    this.geoClass = null
    this.hiddenWhileLive = false

    const speechCtor = getSpeechCtor(this.deps.SpeechRecognition)
    const speechAvailable = Boolean(speechCtor)
    this.emit({
      live: true,
      phase: 'live',
      recording: false,
      sessionId: id,
      startedAtMs,
      transcript: '',
      interim: '',
      conversationCount: 0,
      error: null,
      speechAvailable,
      speechNote: speechAvailable
        ? null
        : 'Live transcript needs Chrome. Audio is still being recorded.',
      lat: null,
      lng: null,
      accuracy: null,
      place: null,
      resumeNote: null,
    })

    this.beginConversation()
    this.startRecognition()
    this.beginWatch()
    void this.acquireWakeLock()
    this.bindVisibility()
    this.startEnergyMonitor()
    this.startIdleWatch()
    if (getKeepAlive()) startKeepAlive()
  }

  private conversationCountReset(): void {
    /* snapshot reset in start() */
  }

  async stop(): Promise<void> {
    if (this.snapshot.phase === 'starting' && !this.snapshot.live && !this.snapshot.sessionId) {
      this.startGen += 1
      this.clearGumTimer()
      this.stopStream()
      this.emit({ phase: 'idle', live: false, recording: false, error: null })
      return
    }
    if (!this.snapshot.live && !this.snapshot.sessionId) return
    this.wantRecognition = false
    this.clearSilenceTimer()
    this.clearIdleWatch()
    this.stopRecognition()
    this.clearWatch()
    await this.closeConversation()
    this.stopStream()
    this.stopEnergyMonitor()
    stopKeepAlive()
    void this.releaseWakeLock()
    this.unbindVisibility()
    const sessionId = this.snapshot.sessionId
    if (sessionId) {
      await db.sessions.update(sessionId, { endedAt: nowISO() })
    }
    this.emit({
      live: false,
      phase: 'idle',
      recording: false,
      transcript: '',
      interim: '',
      error: null,
    })
  }

  retry(): void {
    if (this.snapshot.live) {
      this.beginWatch()
      this.startRecognition()
      if (!this.recorder || this.recorder.state === 'inactive') this.beginConversation()
      return
    }
    void this.start()
  }

  ingestSpeech(text: string, isFinal: boolean, at = this.now()): void {
    if (!this.snapshot.live) return
    const piece = text.trim()
    if (!piece) return
    this.markActivity(at)
    if (!this.convId) this.beginConversation()
    if (isFinal) {
      this.finalTranscript = `${this.finalTranscript} ${piece}`.replace(/\s+/g, ' ').trim()
      this.emit({ transcript: this.finalTranscript, interim: '' })
    } else {
      this.emit({ transcript: this.finalTranscript, interim: piece })
    }
  }

  ingestPosition(ping: Ping): void {
    if (!this.snapshot.live) return
    if (this.lastPingAt && ping.at - this.lastPingAt < PING_THROTTLE_MS) {
      this.emit({
        lat: ping.lat,
        lng: ping.lng,
        accuracy: ping.accuracy,
      })
      return
    }
    this.lastPingAt = ping.at
    this.emit({
      lat: ping.lat,
      lng: ping.lng,
      accuracy: ping.accuracy,
    })
    void reverseGeocode(ping.lat, ping.lng).then((geo) => {
      if (!this.snapshot.live) return
      this.geoType = geo.nominatimType ?? null
      this.geoClass = geo.nominatimClass ?? null
      this.emit({ place: geo.name })
    })
  }

  checkSilence(at = this.now()): boolean {
    if (!this.snapshot.live) return false
    if (!shouldSplitConversation(this.lastSpeechAt, at)) return false
    void this.closeConversation()
    return true
  }

  async checkIdleStop(at = this.now()): Promise<boolean> {
    if (!this.snapshot.live || this.idleStopping) return false
    if (!shouldIdleStop(this.lastActivityAt, this.snapshot.startedAtMs, at)) return false
    this.idleStopping = true
    try {
      await this.stop()
      toast('Stopped — no speech for 10 minutes.')
      return true
    } finally {
      this.idleStopping = false
    }
  }

  dispose(): void {
    this.startGen += 1
    this.clearGumTimer()
    this.wantRecognition = false
    this.clearSilenceTimer()
    this.clearIdleWatch()
    this.stopRecognition()
    this.clearWatch()
    try {
      this.recorder?.stop()
    } catch {
      /* ignore */
    }
    this.recorder = null
    this.stopStream()
    this.stopEnergyMonitor()
    stopKeepAlive()
    void this.releaseWakeLock()
    this.unbindVisibility()
    this.listeners.clear()
    this.snapshot = emptySnapshot()
  }

  private beginConversation(): void {
    if (!this.snapshot.live) return
    if (this.recorder && this.recorder.state === 'recording') return
    this.convId = crypto.randomUUID()
    this.convStartedMs = this.now()
    this.finalTranscript = ''
    this.chunks = []
    this.emit({ transcript: '', interim: '' })
    this.startRecorder()
  }

  private startRecorder(): void {
    const stream = this.stream
    if (!stream) return
    const Rec =
      this.deps.MediaRecorder ??
      ((globalThis as typeof globalThis & { MediaRecorder?: RecorderCtor }).MediaRecorder as
        | RecorderCtor
        | undefined)
    if (!Rec) {
      this.emit({
        error: this.snapshot.error ?? 'Audio recorder is not available in this browser.',
      })
      return
    }
    try {
      this.recorder = this.mime ? new Rec(stream, { mimeType: this.mime }) : new Rec(stream)
    } catch {
      try {
        this.recorder = new Rec(stream)
      } catch {
        this.emit({ error: 'Could not start the audio recorder.' })
        return
      }
    }
    this.chunks = []
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data)
    }
    this.recorder.onstop = () => {
      /* blob assembled in closeConversation */
    }
    try {
      this.recorder.start(1000)
      this.emit({ recording: true })
    } catch {
      this.emit({ error: 'Could not start the audio recorder.' })
    }
  }

  private stopRecorder(): Promise<void> {
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') {
      this.emit({ recording: false })
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const prev = rec.onstop
      rec.onstop = () => {
        prev?.()
        this.emit({ recording: false })
        resolve()
      }
      try {
        rec.stop()
      } catch {
        this.emit({ recording: false })
        resolve()
      }
      window.setTimeout(resolve, 1500)
    })
  }

  private async closeConversation(): Promise<void> {
    this.clearSilenceTimer()
    const convId = this.convId
    const startedMs = this.convStartedMs
    const transcript = this.finalTranscript.trim()
    const interim = this.snapshot.interim
    await this.stopRecorder()
    this.recorder = null
    this.convId = null
    this.convStartedMs = null
    this.lastSpeechAt = null
    const combined = `${transcript} ${interim}`.replace(/\s+/g, ' ').trim()
    this.emit({ transcript: '', interim: '' })
    if (!convId || startedMs == null) return
    const durationSec = Math.max(0, Math.round((this.now() - startedMs) / 1000))
    if (!combined && this.chunks.length === 0) return
    if (!combined && durationSec < 2) return

    const run = async () => {
      const analysis = analyzeTranscript(combined, durationSec)
      const who = extractIntroName(combined) ?? ''
      const mime = this.mime || 'audio/webm'
      const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: mime }) : null
      const audioId = blob && blob.size > 0 ? crypto.randomUUID() : null
      if (audioId && blob) {
        await db.audioClips.add({
          id: audioId,
          conversationId: convId,
          blob,
          mimeType: mime,
          createdAt: nowISO(),
        })
      }
      const lat = this.snapshot.lat
      const lng = this.snapshot.lng
      let place = this.snapshot.place ?? ''
      if (!place && lat != null && lng != null) {
        const geo = await reverseGeocode(lat, lng)
        place = geo.name
        this.geoType = geo.nominatimType ?? this.geoType
        this.geoClass = geo.nominatimClass ?? this.geoClass
      }
      const keyed = hasApiKey()
      const now = nowISO()
      const row: Approach = {
        id: convId,
        at: new Date(startedMs).toISOString(),
        place: place || 'Unknown place',
        who,
        opener: '',
        notes: analysis.summary,
        outcome: analysis.outcome,
        feel: null,
        followUpAt: analysis.followUpAt,
        followUpDone: false,
        createdAt: now,
        updatedAt: now,
        source: 'recording',
        lat,
        lng,
        accuracy: this.snapshot.accuracy,
        dwellSeconds: durationSec,
        sessionId: this.snapshot.sessionId,
        endedAt: now,
        transcript: combined,
        analysis,
        audioId,
        analysisSource: keyed ? 'pending' : 'rules',
        insight: null,
      }
      await db.approaches.put(row)
      this.emit({ conversationCount: this.snapshot.conversationCount + 1 })
      if (keyed) {
        const ctx: UnderstandContext = {
          at: row.at,
          place: row.place,
          durationSec,
          lat,
          lng,
        }
        const job = this.enrichConversation(row.id, blob, mime, combined, ctx, {
          nominatimType: this.geoType ?? undefined,
          nominatimClass: this.geoClass ?? undefined,
        })
        this.enrichChain = this.enrichChain.then(() => job, () => job)
      }
    }
    this.writeChain = this.writeChain.then(run, run)
    await this.writeChain
    this.chunks = []
    this.finalTranscript = ''
  }

  private async enrichConversation(
    id: string,
    blob: Blob | null,
    mime: string,
    liveTranscript: string,
    ctx: UnderstandContext,
    geo?: { nominatimType?: string; nominatimClass?: string },
  ): Promise<void> {
    let text = liveTranscript
    let transcribed = false
    let proofLang: SpokenLanguage | undefined
    if (blob && blob.size > 0) {
      try {
        text = await transcribeAudio(blob, mime)
        transcribed = true
        try {
          const proofed = await proofTranscript(text)
          text = proofed.text
          proofLang = proofed.language
        } catch {
          /* keep Whisper text */
        }
      } catch {
        text = liveTranscript
      }
    }
    try {
      const raw = await understandTranscript(text, ctx)
      const existing = await db.approaches.get(id)
      if (!existing) return
      const insight = mergePlaceSignals(raw, existing.place || ctx.place, existing.at, {
        nominatimType: geo?.nominatimType,
        nominatimClass: geo?.nominatimClass,
        language: proofLang ?? raw.language,
      })
      const who = insight.who.trim() || existing.who
      const followUpAt =
        existing.followUpAt ??
        (insight.followUpSuggestion || insight.success ? tomorrowIso() : null)
      await db.approaches.update(id, {
        transcript: text || existing.transcript,
        insight,
        analysisSource: 'model',
        who,
        outcome: insight.outcome,
        notes: insight.summary,
        followUpAt,
        updatedAt: nowISO(),
      })
    } catch {
      toast('Could not understand this conversation')
      const patch: Partial<Approach> = {
        analysisSource: 'rules',
        updatedAt: nowISO(),
      }
      if (transcribed && text) patch.transcript = text
      await db.approaches.update(id, patch)
    }
  }

  private startRecognition(): void {
    const Ctor = getSpeechCtor(this.deps.SpeechRecognition)
    if (!Ctor) return
    this.wantRecognition = true
    if (this.recognition) return
    try {
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = speechRecognitionLang()
      rec.onresult = (ev) => {
        this.markActivity()
        let interim = ''
        let finals = ''
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const piece = ev.results[i]
          const t = piece[0]?.transcript ?? ''
          if (piece.isFinal) finals += ` ${t}`
          else interim += ` ${t}`
        }
        if (finals.trim()) this.ingestSpeech(finals, true)
        else if (interim.trim()) this.ingestSpeech(interim, false)
      }
      rec.onend = () => {
        this.recognition = null
        if (this.wantRecognition && this.snapshot.live) {
          window.setTimeout(() => this.startRecognition(), 250)
        }
      }
      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed') {
          this.wantRecognition = false
          this.emit({
            speechNote: 'Speech permission denied. Audio is still recorded.',
          })
          return
        }
        if (ev.error === 'aborted') return
      }
      rec.start()
      this.recognition = rec
    } catch {
      this.emit({
        speechNote: 'Live transcript needs Chrome. Audio is still being recorded.',
        speechAvailable: false,
      })
    }
  }

  private stopRecognition(): void {
    this.wantRecognition = false
    try {
      this.recognition?.stop()
    } catch {
      /* ignore */
    }
    this.recognition = null
  }

  private beginWatch(): void {
    const geo =
      this.deps.geolocation === undefined
        ? navigator.geolocation
        : this.deps.geolocation
    if (!geo) return
    this.clearWatch()
    try {
      this.watchId = geo.watchPosition(
        (pos) => {
          this.ingestPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            at: pos.timestamp || this.now(),
          })
        },
        (err) => {
          if (err.code === 1) {
            this.emit({
              error: 'Location permission denied. Audio still records. Enable location and retry.',
            })
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      )
    } catch {
      /* location optional */
    }
  }

  private clearWatch(): void {
    const geo =
      this.deps.geolocation === undefined
        ? navigator.geolocation
        : this.deps.geolocation
    if (this.watchId != null && geo) {
      try {
        geo.clearWatch(this.watchId)
      } catch {
        /* ignore */
      }
    }
    this.watchId = null
  }

  private async microphoneDenied(): Promise<boolean> {
    try {
      const query = navigator.permissions?.query
      if (typeof query !== 'function') return false
      const status = await query.call(navigator.permissions, {
        name: 'microphone' as PermissionName,
      })
      return status.state === 'denied'
    } catch {
      return false
    }
  }

  private clearGumTimer(): void {
    if (this.gumTimer != null) {
      clearTimeout(this.gumTimer)
      this.gumTimer = null
    }
  }

  private haltStream(stream: MediaStream): void {
    stream.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        /* ignore */
      }
    })
  }

  private stopStream(): void {
    if (this.stream) this.haltStream(this.stream)
    this.stream = null
  }

  private markActivity(at = this.now()): void {
    this.lastSpeechAt = at
    this.lastActivityAt = at
    this.scheduleSilenceCheck()
  }

  private scheduleSilenceCheck(): void {
    this.clearSilenceTimer()
    this.silenceTimer = setTimeout(() => {
      this.checkSilence()
    }, SILENCE_MS)
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer != null) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  private startIdleWatch(): void {
    this.clearIdleWatch()
    this.idleTimer = setInterval(() => {
      void this.checkIdleStop()
    }, 5_000)
  }

  private clearIdleWatch(): void {
    if (this.idleTimer != null) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  private onVisibility = (): void => {
    if (!this.snapshot.live) return
    if (document.visibilityState === 'hidden') {
      this.hiddenWhileLive = true
      return
    }
    this.handleResume()
  }

  private onPageShow = (): void => {
    if (this.snapshot.live) this.handleResume()
  }

  private handleResume(): void {
    if (!this.snapshot.live) return
    void this.acquireWakeLock()
    if (getKeepAlive()) {
      startKeepAlive()
      this.restartRecognition()
    }
    if (this.hiddenWhileLive) {
      this.hiddenWhileLive = false
      const recording = this.recorder?.state === 'recording' || this.snapshot.recording
      this.emit({
        resumeNote: recording
          ? 'Recording continued while you were away.'
          : 'Recording was interrupted. Audio may have stopped — keep Field on screen.',
      })
    }
  }

  private restartRecognition(): void {
    if (!this.snapshot.live) return
    this.wantRecognition = true
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch {
        /* onend restarts */
      }
      return
    }
    this.startRecognition()
  }

  private bindVisibility(): void {
    if (!this.visibilityBound) {
      document.addEventListener('visibilitychange', this.onVisibility)
      this.visibilityBound = true
    }
    if (!this.pageshowBound) {
      window.addEventListener('pageshow', this.onPageShow)
      this.pageshowBound = true
    }
  }

  private unbindVisibility(): void {
    if (this.visibilityBound) {
      document.removeEventListener('visibilitychange', this.onVisibility)
      this.visibilityBound = false
    }
    if (this.pageshowBound) {
      window.removeEventListener('pageshow', this.onPageShow)
      this.pageshowBound = false
    }
  }

  private startEnergyMonitor(): void {
    this.stopEnergyMonitor()
    const stream = this.stream
    if (!stream) return
    const AC = audioContextCtor()
    if (!AC) return
    try {
      const ctx = new AC()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      this.audioCtx = ctx
      this.analyser = analyser
      this.energySource = source
      void ctx.resume?.()
      this.energyTimer = setInterval(() => this.sampleEnergy(), 250)
    } catch {
      this.stopEnergyMonitor()
    }
  }

  private sampleEnergy(): void {
    if (!this.analyser || !this.snapshot.live) return
    try {
      const buf = new Float32Array(this.analyser.fftSize)
      this.analyser.getFloatTimeDomainData(buf as Parameters<AnalyserNode['getFloatTimeDomainData']>[0])
      let sum = 0
      for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      if (rms > 0.04) {
        this.markActivity()
        if (!this.convId) this.beginConversation()
      }
    } catch {
      /* analyser optional */
    }
  }

  private stopEnergyMonitor(): void {
    if (this.energyTimer != null) {
      clearInterval(this.energyTimer)
      this.energyTimer = null
    }
    try {
      this.energySource?.disconnect()
    } catch {
      /* ignore */
    }
    this.energySource = null
    this.analyser = null
    try {
      void this.audioCtx?.close()
    } catch {
      /* ignore */
    }
    this.audioCtx = null
  }

  private async acquireWakeLock(): Promise<void> {
    await this.releaseWakeLock()
    const api =
      this.deps.wakeLock ??
      (navigator as Navigator & { wakeLock?: SessionDeps['wakeLock'] }).wakeLock
    if (!api) return
    try {
      this.wake = await api.request('screen')
    } catch {
      this.wake = null
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wake?.release()
    } catch {
      /* ignore */
    }
    this.wake = null
  }
}

let runtime: SessionRuntime | null = null
let testDeps: SessionDeps | undefined

export function setSessionTestDeps(deps?: SessionDeps): void {
  testDeps = deps
  resetSessionRuntime()
}

export function getSessionRuntime(): SessionRuntime {
  if (!runtime) runtime = new SessionRuntime(testDeps ?? {})
  return runtime
}

export function resetSessionRuntime(): void {
  runtime?.dispose()
  runtime = null
}
