import type { SpeechLangPref } from './types'

export const SPEECH_LANG_STORAGE = 'field:speechLang'
export const KEEP_ALIVE_STORAGE = 'field:keepAlive'

export function getSpeechLang(): SpeechLangPref {
  try {
    const v = localStorage.getItem(SPEECH_LANG_STORAGE)
    if (v === 'he' || v === 'en' || v === 'auto') return v
    return 'auto'
  } catch {
    return 'auto'
  }
}

export function setSpeechLang(pref: SpeechLangPref): void {
  try {
    localStorage.setItem(SPEECH_LANG_STORAGE, pref)
  } catch {
    /* ignore quota / private mode */
  }
}

/** Whisper language param: omit on Auto so the model can detect he/en/mixed. */
export function whisperLanguage(): 'he' | 'en' | undefined {
  const pref = getSpeechLang()
  if (pref === 'he') return 'he'
  if (pref === 'en') return 'en'
  return undefined
}

export function speechRecognitionLang(): string {
  const pref = getSpeechLang()
  if (pref === 'he') return 'he-IL'
  if (pref === 'en') return 'en-US'
  const nav =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : ''
  return nav.toLowerCase().startsWith('he') ? 'he-IL' : 'en-US'
}

export function getKeepAlive(): boolean {
  try {
    const v = localStorage.getItem(KEEP_ALIVE_STORAGE)
    if (v === null) return true
    return v !== '0' && v !== 'false'
  } catch {
    return true
  }
}

export function setKeepAlive(on: boolean): void {
  try {
    localStorage.setItem(KEEP_ALIVE_STORAGE, on ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}
