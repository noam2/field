import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { getSessionRuntime, setSessionTestDeps } from '../session'
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

function deferredGum() {
  let resolveGum!: (stream: MediaStream) => void
  const promise = new Promise<MediaStream>((resolve) => {
    resolveGum = resolve
  })
  return {
    getUserMedia: vi.fn(() => promise),
    resolve: () => resolveGum(fakeStream()),
  }
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
    expect(screen.getByText(/tap to record/i)).toBeInTheDocument()
    expect(screen.queryByText(/start session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/stop session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rec on/i)).not.toBeInTheDocument()
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
    expect(screen.getByText(/rec on/i)).toBeInTheDocument()
    expect(screen.getByText(/tap to stop/i)).toBeInTheDocument()
  })

  it('shows Starting or REC ON before getUserMedia resolves', async () => {
    const gum = deferredGum()
    setSessionTestDeps({
      getUserMedia: gum.getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const user = userEvent.setup()
    const { container } = render(<Log approaches={[]} />)
    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await waitFor(() => {
      expect(screen.getByText(/starting/i).textContent || screen.getByText(/rec on/i)).toBeTruthy()
    })
    expect(screen.getByText(/rec on/i)).toBeInTheDocument()
    expect(screen.getByText(/starting/i)).toBeInTheDocument()
    expect(container.querySelector('.log.is-recording')).toBeTruthy()
    expect(container.querySelector('.rec-btn.is-live')).toBeTruthy()
    expect(screen.queryByText(/^record$/i)).not.toBeInTheDocument()
    gum.resolve()
    expect(await screen.findByRole('button', { name: /stop recording/i })).toBeInTheDocument()
    expect(screen.getByText(/listening/i)).toBeInTheDocument()
    expect(screen.getByText(/mic on/i)).toBeInTheDocument()
  })

  it('stop returns to idle Record, not stuck starting or disabled', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    setSessionTestDeps({
      getUserMedia,
      MediaRecorder: FakeRecorder as never,
      SpeechRecognition: null,
      geolocation: null,
    })
    const user = userEvent.setup()
    const { container } = render(<Log approaches={[]} />)
    await user.click(screen.getByRole('button', { name: /start recording/i }))
    const stopBtn = await screen.findByRole('button', { name: /stop recording/i })
    await user.click(stopBtn)
    const startBtn = await screen.findByRole('button', { name: /start recording/i })
    expect(startBtn).toBeEnabled()
    expect(startBtn).toHaveTextContent(/^record$/i)
    expect(screen.getByText(/tap to record/i)).toBeInTheDocument()
    expect(screen.queryByText(/rec on/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/starting/i)).not.toBeInTheDocument()
    expect(container.querySelector('.log.is-recording')).toBeFalsy()
    expect(getSessionRuntime().getSnapshot().phase).toBe('idle')
  })
})
