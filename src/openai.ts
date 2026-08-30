export const OPENAI_KEY_STORAGE = 'field:openaiKey'

export function getApiKey(): string {
  try {
    return localStorage.getItem(OPENAI_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(k: string): void {
  try {
    const trimmed = k.trim()
    if (!trimmed) localStorage.removeItem(OPENAI_KEY_STORAGE)
    else localStorage.setItem(OPENAI_KEY_STORAGE, trimmed)
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export function openaiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
  }
}
