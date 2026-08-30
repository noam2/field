import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getIdleStopMs, getPauseMs, IDLE_STOP_MS_STORAGE, PAUSE_MS_STORAGE } from '../timing'
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

  it('changing pause segment updates the stored pref', async () => {
    const user = userEvent.setup()
    render(<Settings onClose={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'New conversation after pause' })
    await user.click(within(group).getByRole('radio', { name: '30s' }))
    expect(getPauseMs()).toBe(30_000)
    expect(localStorage.getItem(PAUSE_MS_STORAGE)).toBe('30000')
  })

  it('changing idle-stop segment to Off stores 0', async () => {
    const user = userEvent.setup()
    render(<Settings onClose={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Stop recording after silence' })
    await user.click(within(group).getByRole('radio', { name: 'Off' }))
    expect(getIdleStopMs()).toBe(0)
    expect(localStorage.getItem(IDLE_STOP_MS_STORAGE)).toBe('0')
  })
})
