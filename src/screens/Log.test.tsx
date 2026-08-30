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
  it('shows Start recording and does not record until clicked', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    setSessionTestDeps({
      getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    render(<Log approaches={[]} />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    expect(screen.getByText(/tap to record\. enrolled study session/i)).toBeInTheDocument()
    expect(screen.queryByText(/start session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/stop session/i)).not.toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('Install Field button fires prompt() after beforeinstallprompt', async () => {
    const prompt = vi.fn(async () => {})
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperty(event, 'prompt', { value: prompt })
    render(<Log approaches={[]} />)
    window.dispatchEvent(event)
    const button = await screen.findByRole('button', { name: /^install field$/i })
    await userEvent.click(button)
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  })

  it('starts recording after tap and the same button becomes Stop recording', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    setSessionTestDeps({
      getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const user = userEvent.setup()
    render(<Log approaches={[]} />)
    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: /stop recording/i })).toBeInTheDocument()
    expect(screen.queryByText(/start session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/stop session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/session live/i)).not.toBeInTheDocument()
  })
})
