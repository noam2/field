import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { resetInstallPrompt } from '../install'
import { resetSessionRuntime } from '../session'

beforeEach(async () => {
  vi.useRealTimers()
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    writable: true,
    value: undefined,
  })
  resetSessionRuntime()
  resetInstallPrompt()
  localStorage.clear()
  try {
    await db.approaches.clear()
    await db.sessions.clear()
    await db.audioClips.clear()
  } catch {
    /* db may not be open yet */
  }
})

afterEach(() => {
  cleanup()
  resetSessionRuntime()
})
