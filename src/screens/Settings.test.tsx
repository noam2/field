import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db, getLastPlace, setLastPlace } from '../db'
import { getSpeechLang, setSpeechLang } from '../lang'
import { getApiKey, setApiKey } from '../openai'
import { approach } from '../test/helpers'
import { getIdleStopMs, getPauseMs, IDLE_STOP_MS_STORAGE, PAUSE_MS_STORAGE, setPauseMs } from '../timing'
import { Settings } from './Settings'

describe('Settings recording timing', () => {
  it('renders the two recording legends', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.getByText('New conversation after pause')).toBeInTheDocument()
    expect(screen.getByText('Stop recording after silence')).toBeInTheDocument()
    expect(
      screen.getByText('Pause starts a new conversation. Silence can stop the session.'),
    ).toBeInTheDocument()
  })

  it('changing pause select updates the stored pref', async () => {
    const user = userEvent.setup()
    render(<Settings onClose={() => {}} />)
    const select = screen.getByRole('combobox', { name: 'New conversation after pause' })
    await user.selectOptions(select, '30000')
    expect(getPauseMs()).toBe(30_000)
    expect(localStorage.getItem(PAUSE_MS_STORAGE)).toBe('30000')
  })

  it('changing idle-stop select to Off stores 0', async () => {
    const user = userEvent.setup()
    render(<Settings onClose={() => {}} />)
    const select = screen.getByRole('combobox', { name: 'Stop recording after silence' })
    await user.selectOptions(select, '0')
    expect(getIdleStopMs()).toBe(0)
    expect(localStorage.getItem(IDLE_STOP_MS_STORAGE)).toBe('0')
  })
})

describe('Settings Reset all data', () => {
  it('shows a Reset all data button', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reset all data' })).toBeInTheDocument()
  })

  it('confirm then empties encounter data and keeps settings', async () => {
    const user = userEvent.setup()
    setApiKey('sk-keep-me')
    setSpeechLang('he')
    setPauseMs(30_000)
    setLastPlace('Cafe X')
    await db.approaches.add(approach({ place: 'Cafe X' }))
    await db.sessions.add({ id: 'sess-1', startedAt: new Date().toISOString(), endedAt: null })
    await db.audioClips.add({
      id: 'aud-1',
      conversationId: 'c1',
      blob: new Blob(['x'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      createdAt: new Date().toISOString(),
    })

    render(<Settings onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Reset all data' }))
    expect(screen.getByText('Reset everything?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset all data' }))

    expect(await db.approaches.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
    expect(getLastPlace()).toBe('')
    expect(getApiKey()).toBe('sk-keep-me')
    expect(getSpeechLang()).toBe('he')
    expect(getPauseMs()).toBe(30_000)
  })

  it('cancel leaves data in place', async () => {
    const user = userEvent.setup()
    await db.approaches.add(approach({ place: 'Stay' }))
    render(<Settings onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Reset all data' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await db.approaches.count()).toBe(1)
    expect(screen.queryByText('Reset everything?')).not.toBeInTheDocument()
  })
})
