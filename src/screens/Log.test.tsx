import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { setSessionTestDeps } from '../session'
import { Log } from './Log'

class FakeRecorder {
  state = 'inactive'
  ondataavailable: ((ev: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop() {} }] } as unknown as MediaStream
}

beforeEach(async () => {
  localStorage.clear()
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
  setSessionTestDeps(undefined)
})

describe('Log', () => {
  it('shows Start session and does not record until clicked', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    setSessionTestDeps({
      getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    render(<Log approaches={[]} />)
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
    expect(screen.getByText(/enrolled study participant/i)).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('starts recording after Start session', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    setSessionTestDeps({
      getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const user = userEvent.setup()
    render(<Log approaches={[]} />)
    await user.click(screen.getByRole('button', { name: /start session/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/session live/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop session/i })).toBeInTheDocument()
  })
})
