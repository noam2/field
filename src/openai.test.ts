import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSpeechLang } from './lang'
import { getApiKey, hasApiKey, openaiHeaders, setApiKey } from './openai'
import { transcribeAudio } from './transcribe'
import { parseInsightJson, parseProofJson, understandTranscript } from './understand'

const VALID = {
  sentiment: 'positive',
  success: true,
  valence: 0.7,
  outcome: 'number',
  who: 'Maya',
  topics: ['work'],
  commitments: ['Text me later'],
  objections: [],
  questionsAsked: 2,
  energy: 'high',
  summary: 'Maya shared her number after talking about work.',
  followUpSuggestion: 'Text Maya tomorrow.',
  exchangedContact: true,
  scheduled: false,
  rejection: false,
  model: 'gpt-4o-mini',
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('openai key helpers', () => {
  it('stores and reports a key without throwing', () => {
    expect(hasApiKey()).toBe(false)
    expect(getApiKey()).toBe('')
    setApiKey('sk-test-field')
    expect(hasApiKey()).toBe(true)
    expect(getApiKey()).toBe('sk-test-field')
    expect(openaiHeaders().Authorization).toBe('Bearer sk-test-field')
    setApiKey('  ')
    expect(hasApiKey()).toBe(false)
  })
})

describe('parseInsightJson', () => {
  it('accepts a valid payload', () => {
    const parsed = parseInsightJson(VALID)
    expect(parsed).toMatchObject({
      sentiment: 'positive',
      success: true,
      valence: 0.7,
      who: 'Maya',
      topics: ['work'],
    })
  })

  it('rejects garbage, valence 4, and bad sentiment', () => {
    expect(parseInsightJson(null)).toBeNull()
    expect(parseInsightJson('nope')).toBeNull()
    expect(parseInsightJson({})).toBeNull()
    expect(parseInsightJson({ ...VALID, valence: 4 })).toBeNull()
    expect(parseInsightJson({ ...VALID, sentiment: 'elated' })).toBeNull()
  })
})

describe('transcribeAudio', () => {
  it('sends multipart to /audio/transcriptions and returns text', async () => {
    setApiKey('sk-test-field')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/audio/transcriptions')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      const form = init!.body as FormData
      expect(form.get('model')).toBe('gpt-4o-mini-transcribe')
      expect(form.get('language')).toBeNull()
      expect(form.get('response_format')).toBe('text')
      expect(form.get('file')).toBeTruthy()
      return new Response('hello from whisper', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const text = await transcribeAudio(new Blob(['abc'], { type: 'audio/webm' }), 'audio/webm')
    expect(text).toBe('hello from whisper')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Hebrew settings send language=he', async () => {
    setApiKey('sk-test-field')
    setSpeechLang('he')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const form = init!.body as FormData
      expect(form.get('language')).toBe('he')
      return new Response('שלום', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const text = await transcribeAudio(new Blob(['abc'], { type: 'audio/webm' }), 'audio/webm')
    expect(text).toBe('שלום')
  })

  it('does not fetch understand without an API key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      understandTranscript('Hello there', {
        at: '2026-08-30T18:00:00.000Z',
        place: 'Cafe X',
        durationSec: 12,
        lat: null,
        lng: null,
      }),
    ).rejects.toThrow(/key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('understandTranscript', () => {
  it('sends chat/completions and returns parsed insight', async () => {
    setApiKey('sk-test-field')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/chat/completions')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as {
        model: string
        response_format: { type: string }
        messages: { role: string; content: string }[]
      }
      expect(body.model).toBe('gpt-4o-mini')
      expect(body.response_format.type).toBe('json_schema')
      expect(body.messages[0]?.role).toBe('system')
      expect(body.messages[1]?.content).toContain('Nice talking')
      expect(body.messages[1]?.content).toContain('Cafe X')
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: JSON.stringify(VALID) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const insight = await understandTranscript('Nice talking with Maya.', {
      at: '2026-08-30T18:00:00.000Z',
      place: 'Cafe X',
      durationSec: 42,
      lat: 32.1,
      lng: 34.8,
    })
    expect(insight.who).toBe('Maya')
    expect(insight.success).toBe(true)
    expect(insight.model).toBe('gpt-4o-mini')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not fetch understand without an API key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      understandTranscript('Hello there', {
        at: '2026-08-30T18:00:00.000Z',
        place: 'Cafe X',
        durationSec: 12,
        lat: null,
        lng: null,
      }),
    ).rejects.toThrow(/key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('parseProofJson', () => {
  it('parses language he/en/mixed', () => {
    expect(parseProofJson({ language: 'he', text: 'שלום' })).toEqual({ language: 'he', text: 'שלום' })
    expect(parseProofJson({ language: 'en', text: 'hello' })).toEqual({ language: 'en', text: 'hello' })
    expect(parseProofJson({ language: 'mixed', text: 'hi שלום' })).toEqual({
      language: 'mixed',
      text: 'hi שלום',
    })
    expect(parseProofJson({ language: 'fr', text: 'bonjour' })).toBeNull()
    expect(parseProofJson({ language: 'he' })).toBeNull()
  })
})
