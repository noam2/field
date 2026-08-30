import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { recording } from '../test/helpers'
import { Stats } from './Stats'

describe('Stats', () => {
  it('shows empty CTA without recordings', () => {
    render(<Stats approaches={[]} onLog={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument()
    expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start a session/i })).toBeInTheDocument()
  })

  it('renders a dense briefing with recordings', () => {
    const rows = [
      recording("Hey I'm Maya. Here's my number 555-0101.", { id: 's-1', place: 'Cafe X' }),
      recording('Gotta go, not interested.', { id: 's-2', place: 'Bar Y' }),
      recording('Want to get coffee tomorrow?', { id: 's-3', place: 'Cafe X' }),
      recording('Too loud in here. No thanks.', { id: 's-4', place: 'Bar Y' }),
    ]
    render(<Stats approaches={rows} onLog={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument()
    expect(screen.getByText(/of 4/)).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText(/success by time of day/i)).toBeInTheDocument()
    expect(screen.getByText(/success by place type/i)).toBeInTheDocument()
    expect(screen.getByText(/success by hour/i)).toBeInTheDocument()
    expect(screen.getByText(/success by weekday/i)).toBeInTheDocument()
    expect(screen.getByText(/named places/i)).toBeInTheDocument()
    expect(screen.getByText(/valence by place/i)).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.getByText('Rejection')).toBeInTheDocument()
  })
})
