import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { db } from '../db'
import { resetInstallPrompt } from '../install'
import { resetSessionRuntime } from '../session'

beforeEach(async () => {
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
