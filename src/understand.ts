import { getApiKey, openaiHeaders } from './openai'
import type { Energy, Insight, Outcome, Sentiment, UnderstandContext } from './types'

const COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
export const UNDERSTAND_MODEL = 'gpt-4o-mini'

const SENTIMENTS: Sentiment[] = ['positive', 'mixed', 'negative', 'neutral']
const ENERGIES: Energy[] = ['low', 'medium', 'high']
const OUTCOMES: Outcome[] = ['number', 'chat', 'date', 'talked', 'no', 'other']

export const INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sentiment: { type: 'string', enum: SENTIMENTS },
    success: { type: 'boolean' },
    valence: { type: 'number' },
    outcome: { type: 'string', enum: OUTCOMES },
    who: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    commitments: { type: 'array', items: { type: 'string' } },
    objections: { type: 'array', items: { type: 'string' } },
    questionsAsked: { type: 'integer' },
    energy: { type: 'string', enum: ENERGIES },
    summary: { type: 'string' },
    followUpSuggestion: { type: ['string', 'null'] },
    exchangedContact: { type: 'boolean' },
    scheduled: { type: 'boolean' },
    rejection: { type: 'boolean' },
  },
  required: [
    'sentiment',
    'success',
    'valence',
    'outcome',
    'who',
    'topics',
    'commitments',
    'objections',
    'questionsAsked',
    'energy',
    'summary',
    'followUpSuggestion',
    'exchangedContact',
    'scheduled',
    'rejection',
  ],
} as const

const SYSTEM_PROMPT = [
  'You analyze a consented study-session conversation between enrolled participants.',
  'Extract structured fields only from the transcript. Do not invent facts.',
  'If the transcript is empty, sentiment is neutral, success is false, and summary says no speech was captured.',
  'success is true only when contact was exchanged OR a meetup was scheduled, and the conversation is not a rejection.',
  'valence is a number from -1 (very negative) to 1 (very positive).',
  'summary is 1-2 sentences written from the transcript.',
  'followUpSuggestion is a short next step or null if none.',
].join(' ')

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((x): x is string => typeof x === 'string')
}

export function emptyInsight(model = UNDERSTAND_MODEL): Insight {
  return {
    sentiment: 'neutral',
    success: false,
    valence: 0,
    outcome: 'other',
    who: '',
    topics: [],
    commitments: [],
    objections: [],
    questionsAsked: 0,
    energy: 'low',
    summary: 'No speech captured.',
    followUpSuggestion: null,
    exchangedContact: false,
    scheduled: false,
    rejection: false,
    model,
  }
}

export function parseInsightJson(raw: unknown): Insight | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.sentiment !== 'string' || !SENTIMENTS.includes(v.sentiment as Sentiment)) return null
  if (typeof v.success !== 'boolean') return null
  if (typeof v.valence !== 'number' || !Number.isFinite(v.valence) || v.valence < -1 || v.valence > 1) {
    return null
  }
  if (typeof v.outcome !== 'string' || !OUTCOMES.includes(v.outcome as Outcome)) return null
  if (typeof v.who !== 'string') return null
  const topics = stringList(v.topics)
  const commitments = stringList(v.commitments)
  const objections = stringList(v.objections)
  if (!topics || !commitments || !objections) return null
  if (typeof v.questionsAsked !== 'number' || !Number.isFinite(v.questionsAsked) || v.questionsAsked < 0) {
    return null
  }
  if (typeof v.energy !== 'string' || !ENERGIES.includes(v.energy as Energy)) return null
  if (typeof v.summary !== 'string') return null
  if (!(v.followUpSuggestion === null || typeof v.followUpSuggestion === 'string')) return null
  if (typeof v.exchangedContact !== 'boolean') return null
  if (typeof v.scheduled !== 'boolean') return null
  if (typeof v.rejection !== 'boolean') return null
  const model = typeof v.model === 'string' ? v.model : ''
  return {
    sentiment: v.sentiment as Sentiment,
    success: v.success,
    valence: v.valence,
    outcome: v.outcome as Outcome,
    who: v.who,
    topics,
    commitments,
    objections,
    questionsAsked: v.questionsAsked,
    energy: v.energy as Energy,
    summary: v.summary,
    followUpSuggestion: v.followUpSuggestion,
    exchangedContact: v.exchangedContact,
    scheduled: v.scheduled,
    rejection: v.rejection,
    model,
  }
}

function parseMessageContent(content: unknown): unknown {
  if (content && typeof content === 'object') return content
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!fenced) return null
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      return null
    }
  }
}

export async function understandTranscript(text: string, ctx: UnderstandContext): Promise<Insight> {
  const transcript = (text ?? '').trim()
  if (!transcript) return emptyInsight()
  if (!getApiKey()) throw new Error('No OpenAI key')
  const res = await fetch(COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      ...openaiHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: UNDERSTAND_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'insight',
          strict: true,
          schema: INSIGHT_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            transcript,
            at: ctx.at,
            place: ctx.place,
            durationSec: ctx.durationSec,
            lat: ctx.lat,
            lng: ctx.lng,
          }),
        },
      ],
    }),
  })
  if (!res.ok) throw new Error('Understanding failed')
  const json = (await res.json()) as {
    model?: string
    choices?: { message?: { content?: unknown } }[]
  }
  const parsed = parseInsightJson(parseMessageContent(json.choices?.[0]?.message?.content))
  if (!parsed) throw new Error('Invalid insight')
  return { ...parsed, model: json.model || parsed.model || UNDERSTAND_MODEL }
}
