import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db, getLastPlace, setLastPlace } from '../db'
import { getSpeechLang, setSpeechLang } from '../lang'
import { getApiKey, setApiKey } from '../openai'
import { approach } from '../test/helpers'
import { getPauseMs, setPauseMs } from '../timing'
import { emptyInsight } from '../understand'
import { History } from './History'

describe('History titles', () => {
  it('shows name · place and does not dump place again', () => {
    render(
      <History
        approaches={[
          approach({
            who: 'Maya',
            place: 'Landwer, Tel Aviv',
            insight: { ...emptyInsight(), scene: 'Landwer' },
          }),
        ]}
      />,
    )
    expect(screen.getByText('Maya · Landwer')).toBeInTheDocument()
    expect(screen.queryByText('Landwer, Tel Aviv')).not.toBeInTheDocument()
  })

  it('falls back to Conversation when unknown', () => {
    render(<History approaches={[approach({ who: '', place: 'Unknown place' })]} />)
    expect(screen.getByText('Conversation')).toBeInTheDocument()
  })
})

describe('History Reset all data', () => {
  it('shows a Reset all data button', () => {
    render(<History approaches={[]} />)
    expect(screen.getByRole('button', { name: 'Reset all data' })).toBeInTheDocument()
  })

  it('confirm then empties db and keeps settings', async () => {
    const user = userEvent.setup()
    setApiKey('sk-keep-me')
    setSpeechLang('en')
    setPauseMs(120_000)
    setLastPlace('Park')
    const row = approach({ place: 'Park' })
    await db.approaches.add(row)
    await db.sessions.add({ id: 'sess-h', startedAt: new Date().toISOString(), endedAt: null })
    await db.audioClips.add({
      id: 'aud-h',
      conversationId: row.id,
      blob: new Blob(['x'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      createdAt: new Date().toISOString(),
    })

    render(<History approaches={[row]} />)
    await user.click(screen.getByRole('button', { name: 'Reset all data' }))
    expect(screen.getByText('Reset everything?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset all data' }))

    expect(await db.approaches.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
    expect(getLastPlace()).toBe('')
    expect(getApiKey()).toBe('sk-keep-me')
    expect(getSpeechLang()).toBe('en')
    expect(getPauseMs()).toBe(120_000)
  })
})
