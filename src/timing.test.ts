import { describe, expect, it } from 'vitest'
import { IDLE_STOP_MS, SILENCE_MS } from './session'
import {
  getIdleStopMs,
  getPauseMs,
  IDLE_STOP_MS_OPTIONS,
  IDLE_STOP_MS_STORAGE,
  PAUSE_MS_OPTIONS,
  PAUSE_MS_STORAGE,
  setIdleStopMs,
  setPauseMs,
} from './timing'

describe('pauseMs prefs', () => {
  it('defaults to SILENCE_MS when missing', () => {
    expect(getPauseMs()).toBe(SILENCE_MS)
    expect(getPauseMs()).toBe(60_000)
  })

  it('allows 5s through 60m with no Off', () => {
    expect([...PAUSE_MS_OPTIONS]).toEqual([
      5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000,
    ])
  })

  it('get/set round-trips allowed values', () => {
    for (const ms of PAUSE_MS_OPTIONS) {
      setPauseMs(ms)
      expect(getPauseMs()).toBe(ms)
      expect(localStorage.getItem(PAUSE_MS_STORAGE)).toBe(String(ms))
    }
  })

  it('invalid storage falls back to 60000', () => {
    localStorage.setItem(PAUSE_MS_STORAGE, 'not-a-number')
    expect(getPauseMs()).toBe(60_000)
    localStorage.setItem(PAUSE_MS_STORAGE, '123')
    expect(getPauseMs()).toBe(60_000)
    localStorage.setItem(PAUSE_MS_STORAGE, '')
    expect(getPauseMs()).toBe(60_000)
    localStorage.setItem(PAUSE_MS_STORAGE, '0')
    expect(getPauseMs()).toBe(60_000)
  })

  it('set ignores values that are not allowed', () => {
    setPauseMs(60_000)
    setPauseMs(45_000)
    expect(getPauseMs()).toBe(60_000)
  })
})

describe('idleStopMs prefs', () => {
  it('defaults to IDLE_STOP_MS when missing', () => {
    expect(getIdleStopMs()).toBe(IDLE_STOP_MS)
    expect(getIdleStopMs()).toBe(600_000)
  })

  it('allows 5s through 60m with Off (0) last and no 15m', () => {
    expect([...IDLE_STOP_MS_OPTIONS]).toEqual([
      5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000, 0,
    ])
    expect(IDLE_STOP_MS_OPTIONS).not.toContain(900_000)
  })

  it('get/set round-trips allowed values including Off as 0', () => {
    for (const ms of IDLE_STOP_MS_OPTIONS) {
      setIdleStopMs(ms)
      expect(getIdleStopMs()).toBe(ms)
      expect(localStorage.getItem(IDLE_STOP_MS_STORAGE)).toBe(String(ms))
    }
    setIdleStopMs(0)
    expect(getIdleStopMs()).toBe(0)
  })

  it('invalid storage falls back to 600000', () => {
    localStorage.setItem(IDLE_STOP_MS_STORAGE, 'abc')
    expect(getIdleStopMs()).toBe(600_000)
    localStorage.setItem(IDLE_STOP_MS_STORAGE, '1000')
    expect(getIdleStopMs()).toBe(600_000)
    localStorage.setItem(IDLE_STOP_MS_STORAGE, '')
    expect(getIdleStopMs()).toBe(600_000)
    localStorage.setItem(IDLE_STOP_MS_STORAGE, '900000')
    expect(getIdleStopMs()).toBe(600_000)
  })

  it('set ignores values that are not allowed', () => {
    setIdleStopMs(600_000)
    setIdleStopMs(12_000)
    expect(getIdleStopMs()).toBe(600_000)
  })
})
