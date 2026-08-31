/** Cheap pre-Whisper gate: keep a clip only if it looks like the wearer talking. */

export const MIN_KEEP_DURATION_SEC = 8
export const MIN_KEEP_WORDS = 8
export const MIN_LOUD_SEC = 2
/** RMS above this is treated as near-field (phone on the wearer's body). */
export const NEAR_FIELD_RMS = 0.12
/** Analyser poll interval; each loud sample adds this many seconds. */
export const ENERGY_SAMPLE_SEC = 0.25
/** Accumulated near-field time while live with no conversation before we open one. */
export const LOUD_OPEN_SEC = 1.5
/** Final speech-rec result must have at least this many words to open a conversation. */
export const MIN_OPEN_FINAL_WORDS = 3

export type ClipGateInput = {
  durationSec: number
  wordCount: number
  loudSec: number
}

export function clipWordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function shouldKeepClip(input: ClipGateInput): boolean {
  return (
    input.durationSec >= MIN_KEEP_DURATION_SEC &&
    input.wordCount >= MIN_KEEP_WORDS &&
    input.loudSec >= MIN_LOUD_SEC
  )
}
