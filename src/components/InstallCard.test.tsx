import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetInstallPrompt } from '../install'
import { InstallCard } from './InstallCard'

afterEach(() => {
  resetInstallPrompt()
})

describe('InstallCard', () => {
  it('shows Chrome menu fallback when there is no beforeinstallprompt', () => {
    render(<InstallCard />)
    expect(screen.getByText(/chrome menu/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^install field$/i })).not.toBeInTheDocument()
  })

  it('Install Field button fires prompt() after beforeinstallprompt', async () => {
    const prompt = vi.fn(async () => {})
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperty(event, 'prompt', { value: prompt })

    render(<InstallCard />)
    window.dispatchEvent(event)

    const button = await screen.findByRole('button', { name: /^install field$/i })
    await userEvent.click(button)
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  })
})
