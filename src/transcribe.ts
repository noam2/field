import { whisperLanguage } from './lang'
import { getApiKey, openaiHeaders } from './openai'

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'
const PREFERRED_MODEL = 'gpt-4o-mini-transcribe'
const FALLBACK_MODEL = 'whisper-1'

function extForMime(mimeType: string): string {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

async function postTranscription(file: File, model: string): Promise<Response> {
  const form = new FormData()
  form.append('file', file)
  form.append('model', model)
  const lang = whisperLanguage()
  if (lang) form.append('language', lang)
  form.append('response_format', 'text')
  return fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: openaiHeaders(),
    body: form,
  })
}

export async function transcribeAudio(blob: Blob, mimeType: string): Promise<string> {
  if (!getApiKey()) throw new Error('No OpenAI key')
  const mime = mimeType || blob.type || 'audio/webm'
  const file = new File([blob], `audio.${extForMime(mime)}`, { type: mime })
  let res = await postTranscription(file, PREFERRED_MODEL)
  if (res.status === 400) {
    res = await postTranscription(file, FALLBACK_MODEL)
  }
  if (!res.ok) {
    throw new Error('Transcription failed')
  }
  const text = await res.text()
  return text.trim()
}
