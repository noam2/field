import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIos, isStandalone, promptInstall, resetInstallPrompt } from './install'

describe('isStandalone', () => {
  it('is false by default in jsdom', () => {
    expect(isStandalone()).toBe(false)
  })
})

describe('isIos', () => {
  const originalUa = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUa,
    })
  })

  it('is true when UA contains iPhone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    expect(isIos()).toBe(true)
  })
})

describe('beforeinstallprompt', () => {
  afterEach(() => {
    resetInstallPrompt()
  })

  it('stores the event so promptInstall can call prompt()', async () => {
    const prompt = vi.fn(async () => {})
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperty(event, 'prompt', { value: prompt })
    window.dispatchEvent(event)
    await expect(promptInstall()).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})
