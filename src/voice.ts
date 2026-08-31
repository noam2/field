import { db } from './db'
import { toast } from './toast'
import type { VoiceProfile } from './types'
import { nowISO } from './utils'

export const VOICE_MATCH_MIN = 0.75
export const VOICE_PROFILE_ID = 'me'
export const ENROLL_SECONDS = 12
export const VOICE_SAMPLE_RATE = 16_000
export const SV_MODEL_ID = 'Xenova/wavlm-base-plus-sv'
export const ENROLL_TOAST = 'Record your voice in Settings first'
export const MODEL_FAIL_TOAST = 'Could not load the voice model'
/** Use at most this many seconds of a clip for embedding. */
const MAX_EMBED_SEC = 15

export type VerifyVoiceFn = (
  clip: Float32Array,
  enrolled: Float32Array,
) => boolean | Promise<boolean>

type SvHandle = {
  processor: (audio: Float32Array) => Promise<unknown>
  model: (inputs: unknown) => Promise<{ embeddings?: { data?: ArrayLike<number> } }>
}

let verifyVoiceFn: VerifyVoiceFn | null = null
let voiceMatchFn: ((blob: Blob) => Promise<boolean>) | null = null
let enrollmentOverride: boolean | null = null
let enrollToastShown = false
let modelFailToastShown = false
let modelPromise: Promise<SvHandle> | null = null

export function cosSim(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i += 1) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (!(denom > 0) || !Number.isFinite(denom)) return 0
  const sim = dot / denom
  return Number.isFinite(sim) ? sim : 0
}

export { cosSim as cos_sim }

export function embeddingMatches(
  clip: ArrayLike<number>,
  enrolled: ArrayLike<number>,
  min = VOICE_MATCH_MIN,
): boolean {
  return cosSim(clip, enrolled) >= min
}

export function setVerifyVoice(fn: VerifyVoiceFn | null): void {
  verifyVoiceFn = fn
}

export function setVoiceMatch(fn: ((blob: Blob) => Promise<boolean>) | boolean | null): void {
  if (fn == null) {
    voiceMatchFn = null
    return
  }
  if (typeof fn === 'boolean') {
    const value = fn
    voiceMatchFn = async () => value
    return
  }
  voiceMatchFn = fn
}

export type VoiceTestHooks = {
  enrolled?: boolean | null
  match?: boolean | ((blob: Blob) => Promise<boolean>) | null
  verify?: VerifyVoiceFn | null
}

export function setVoiceTestHooks(hooks: VoiceTestHooks | null): void {
  if (!hooks) {
    enrollmentOverride = null
    voiceMatchFn = null
    verifyVoiceFn = null
    return
  }
  if ('enrolled' in hooks) enrollmentOverride = hooks.enrolled ?? null
  if ('match' in hooks) setVoiceMatch(hooks.match ?? null)
  if ('verify' in hooks) verifyVoiceFn = hooks.verify ?? null
}

export function resetEnrollmentToast(): void {
  enrollToastShown = false
}

export function noteMissingEnrollment(): void {
  if (enrollToastShown) return
  enrollToastShown = true
  toast(ENROLL_TOAST)
}

function toastModelFail(): void {
  if (modelFailToastShown) return
  modelFailToastShown = true
  toast(MODEL_FAIL_TOAST)
}

export async function getVoiceProfile(): Promise<VoiceProfile | undefined> {
  return db.voiceProfile.get(VOICE_PROFILE_ID)
}

export async function setVoiceProfile(
  embedding: ArrayLike<number>,
  audio?: Blob | null,
): Promise<void> {
  const row: VoiceProfile = {
    id: VOICE_PROFILE_ID,
    embedding: Array.from(embedding),
    createdAt: nowISO(),
  }
  if (audio && audio.size > 0) row.audio = audio
  await db.voiceProfile.put(row)
}

export async function clearVoiceProfile(): Promise<void> {
  await db.voiceProfile.delete(VOICE_PROFILE_ID)
}

export async function hasVoiceEnrollment(): Promise<boolean> {
  if (enrollmentOverride != null) return enrollmentOverride
  try {
    const row = await getVoiceProfile()
    return Boolean(row && row.embedding && row.embedding.length > 0)
  } catch {
    return false
  }
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  if (!(fromRate > 0) || !(toRate > 0) || input.length === 0) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  const last = input.length - 1
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio
    const i0 = Math.min(last, Math.floor(src))
    const i1 = Math.min(last, i0 + 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

export async function decodeClipTo16k(blob: Blob): Promise<Float32Array> {
  const g = globalThis as typeof globalThis & {
    AudioContext?: new (opts?: { sampleRate?: number }) => AudioContext
    webkitAudioContext?: new (opts?: { sampleRate?: number }) => AudioContext
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  if (!Ctor) throw new Error('No AudioContext')
  const ctx = new Ctor()
  try {
    const raw = await ctx.decodeAudioData(await blob.arrayBuffer())
    const channel = raw.getChannelData(0)
    const pcm = resampleLinear(channel, raw.sampleRate, VOICE_SAMPLE_RATE)
    const max = VOICE_SAMPLE_RATE * MAX_EMBED_SEC
    return pcm.length > max ? pcm.subarray(0, max) : pcm
  } finally {
    try {
      await ctx.close?.()
    } catch {
      /* ignore */
    }
  }
}

async function loadSvModel(): Promise<SvHandle> {
  if (import.meta.env.MODE === 'test') {
    throw new Error('voice model is not loaded in tests')
  }
  if (!modelPromise) {
    modelPromise = (async () => {
      const mod = await import('@huggingface/transformers')
      mod.env.allowLocalModels = false
      mod.env.allowRemoteModels = true
      mod.env.useBrowserCache = true
      const processor = await mod.AutoProcessor.from_pretrained(SV_MODEL_ID)
      const model = await mod.AutoModel.from_pretrained(SV_MODEL_ID)
      return {
        processor: (audio: Float32Array) => processor(audio),
        model: (inputs: unknown) =>
          model(inputs as never) as Promise<{ embeddings?: { data?: ArrayLike<number> } }>,
      }
    })()
  }
  try {
    return await modelPromise
  } catch (err) {
    modelPromise = null
    toastModelFail()
    throw err
  }
}

export async function computeEmbedding(audioFloat32: Float32Array): Promise<Float32Array> {
  const { processor, model } = await loadSvModel()
  const inputs = await processor(audioFloat32)
  const out = await model(inputs)
  const data = out?.embeddings?.data
  if (!data || data.length === 0) throw new Error('Empty speaker embedding')
  return data instanceof Float32Array ? data : Float32Array.from(data as ArrayLike<number>)
}

export async function enrollFromBlob(blob: Blob): Promise<void> {
  const pcm = await decodeClipTo16k(blob)
  const embedding = await computeEmbedding(pcm)
  await setVoiceProfile(embedding, blob)
}

export async function verifyVoice(
  clip: Float32Array,
  enrolled: Float32Array,
): Promise<boolean> {
  if (verifyVoiceFn) return verifyVoiceFn(clip, enrolled)
  try {
    const embedding = await computeEmbedding(clip)
    return embeddingMatches(embedding, enrolled)
  } catch {
    toastModelFail()
    return false
  }
}

export async function voiceMatch(blob: Blob): Promise<boolean> {
  if (voiceMatchFn) return voiceMatchFn(blob)
  try {
    const row = await getVoiceProfile()
    if (!row?.embedding?.length) return false
    if (!blob || blob.size === 0) return false
    const pcm = await decodeClipTo16k(blob)
    return verifyVoice(pcm, Float32Array.from(row.embedding))
  } catch {
    toastModelFail()
    return false
  }
}
