/** Must match SILENCE_MS in session.ts */
const DEFAULT_PAUSE_MS = 60_000
/** Must match IDLE_STOP_MS in session.ts */
const DEFAULT_IDLE_STOP_MS = 600_000

export const PAUSE_MS_STORAGE = 'field:pauseMs'
export const IDLE_STOP_MS_STORAGE = 'field:idleStopMs'

/** Allowed pause (new-conversation) durations. Default is 1m (SILENCE_MS). */
export const PAUSE_MS_OPTIONS = [
  5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000,
] as const
/** Allowed idle-stop durations. 0 = Off (never auto-stop). Default is 10m (IDLE_STOP_MS). */
export const IDLE_STOP_MS_OPTIONS = [
  5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000, 0,
] as const

export type PauseMs = (typeof PAUSE_MS_OPTIONS)[number]
export type IdleStopMs = (typeof IDLE_STOP_MS_OPTIONS)[number]

export const PAUSE_MS_LABEL: Record<PauseMs, string> = {
  5_000: '5s',
  10_000: '10s',
  20_000: '20s',
  30_000: '30s',
  60_000: '1m',
  120_000: '2m',
  300_000: '5m',
  600_000: '10m',
  1_200_000: '20m',
  1_800_000: '30m',
  3_600_000: '60m',
}

export const IDLE_STOP_MS_LABEL: Record<IdleStopMs, string> = {
  5_000: '5s',
  10_000: '10s',
  20_000: '20s',
  30_000: '30s',
  60_000: '1m',
  120_000: '2m',
  300_000: '5m',
  600_000: '10m',
  1_200_000: '20m',
  1_800_000: '30m',
  3_600_000: '60m',
  0: 'Off',
}

function parseAllowed(raw: string | null, allowed: readonly number[], fallback: number): number {
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || !allowed.includes(n)) return fallback
  return n
}

export function getPauseMs(): PauseMs {
  try {
    return parseAllowed(
      localStorage.getItem(PAUSE_MS_STORAGE),
      PAUSE_MS_OPTIONS,
      DEFAULT_PAUSE_MS,
    ) as PauseMs
  } catch {
    return DEFAULT_PAUSE_MS
  }
}

export function setPauseMs(ms: number): void {
  if (!(PAUSE_MS_OPTIONS as readonly number[]).includes(ms)) return
  try {
    localStorage.setItem(PAUSE_MS_STORAGE, String(ms))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getIdleStopMs(): IdleStopMs {
  try {
    return parseAllowed(
      localStorage.getItem(IDLE_STOP_MS_STORAGE),
      IDLE_STOP_MS_OPTIONS,
      DEFAULT_IDLE_STOP_MS,
    ) as IdleStopMs
  } catch {
    return DEFAULT_IDLE_STOP_MS
  }
}

export function setIdleStopMs(ms: number): void {
  if (!(IDLE_STOP_MS_OPTIONS as readonly number[]).includes(ms)) return
  try {
    localStorage.setItem(IDLE_STOP_MS_STORAGE, String(ms))
  } catch {
    /* ignore quota / private mode */
  }
}
