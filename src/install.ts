export const HIDE_INSTALL_KEY = 'field:hideInstall'

export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const listeners = new Set<() => void>()
let deferredPrompt: DeferredInstallPrompt | null = null

function emit() {
  for (const listener of listeners) listener()
}

export function isStandalone(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(display-mode: standalone)').matches) return true
    }
  } catch {
    /* jsdom / unsupported */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  return platform === 'MacIntel' && typeof document !== 'undefined' && 'ontouchend' in document
}

export function isInstallHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_INSTALL_KEY) != null
  } catch {
    return false
  }
}

export function hideInstall(): void {
  try {
    localStorage.setItem(HIDE_INSTALL_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function subscribeInstallPrompt(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function getDeferredInstall(): DeferredInstallPrompt | null {
  return deferredPrompt
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const event = deferredPrompt
  deferredPrompt = null
  emit()
  await event.prompt()
  return true
}

export function resetInstallPrompt(): void {
  deferredPrompt = null
  emit()
}

function onBeforeInstallPrompt(e: Event) {
  e.preventDefault()
  deferredPrompt = e as DeferredInstallPrompt
  emit()
}

function onAppInstalled() {
  deferredPrompt = null
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
}

export function androidInstallSteps(): string {
  return 'Chrome menu → Install app / Add to Home screen.'
}

export function iosInstallNote(): string {
  return 'iPhone: Safari → Share → Add to Home Screen.'
}

export function installNote(): string {
  return 'Stay on the home-screen app so it updates itself. Data stays on this phone.'
}

export function shouldShowInstallCard(): boolean {
  return !isStandalone() && !isInstallHidden()
}
