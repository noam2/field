import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { db } from './db'
import { recording } from './test/helpers'

beforeEach(async () => {
  localStorage.clear()
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
})

describe('App', () => {
  it('renders bottom nav labels', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
  })

  it('clicking History shows empty history state', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument()
  })

  it('Start session is on the Log tab', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
  })

  it('History shows a recorded conversation snippet', async () => {
    await db.approaches.add(
      recording("Hey I'm Maya. What do you do? Here's my number 555-867-5309.", {
        place: 'Riverside',
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('Riverside')).toBeInTheDocument()
    expect(screen.getByText(/555-867-5309/)).toBeInTheDocument()
  })
})
