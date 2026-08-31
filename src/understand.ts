import { getApiKey, openaiHeaders } from './openai'
import type {
  Daypart,
  Energy,
  Insight,
  Outcome,
  PlaceType,
  Sentiment,
  SpokenLanguage,
  UnderstandContext,
} from './types'
import { DAYPARTS, PLACE_TYPES, SPOKEN_LANGUAGES } from './types'

const COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
export const UNDERSTAND_MODEL = 'gpt-4o'
export const PROOF_MODEL = 'gpt-4o-mini'

const SENTIMENTS: Sentiment[] = ['positive', 'mixed', 'negative', 'neutral']
const ENERGIES: Energy[] = ['low', 'medium', 'high']
const OUTCOMES: Outcome[] = ['number', 'chat', 'date', 'talked', 'no', 'other']

export type ProofResult = { language: SpokenLanguage; text: string }

export const INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sentiment: { type: 'string', enum: SENTIMENTS },
    success: { type: 'boolean' },
    valence: { type: 'number' },
    outcome: { type: 'string', enum: OUTCOMES },
    who: { type: 'string' },
    scene: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    commitments: { type: 'array', items: { type: 'string' } },
    objections: { type: 'array', items: { type: 'string' } },
    questionsAsked: { type: 'integer' },
    energy: { type: 'string', enum: ENERGIES },
    summary: { type: 'string' },
    followUpSuggestion: { type: ['string', 'null'] },
    whatWorked: { type: 'string' },
    nextAction: { type: 'string' },
    exchangedContact: { type: 'boolean' },
    scheduled: { type: 'boolean' },
    rejection: { type: 'boolean' },
    isApproach: { type: 'boolean' },
    placeType: { type: 'string', enum: PLACE_TYPES },
    daypart: { type: 'string', enum: DAYPARTS },
    language: { type: 'string', enum: SPOKEN_LANGUAGES },
  },
  required: [
    'sentiment',
    'success',
    'valence',
    'outcome',
    'who',
    'scene',
    'topics',
    'commitments',
    'objections',
    'questionsAsked',
    'energy',
    'summary',
    'followUpSuggestion',
    'whatWorked',
    'nextAction',
    'exchangedContact',
    'scheduled',
    'rejection',
    'isApproach',
    'placeType',
    'daypart',
    'language',
  ],
} as const

const SYSTEM_PROMPT = [
  'You analyze a consented study-session conversation between enrolled participants.',
  'The transcript may be Hebrew, English, or mixed (code-switching). Hebrew+English mixing is normal.',
  'Extract structured fields only from the transcript. Do not invent facts, names, plans, or numbers.',
  'who is extracted from the transcript only, Hebrew or English (e.g. Maya, Noa). Do not invent a name. Empty string if unknown.',
  'scene is a short specific setting (about 2-5 words) taken from the transcript or the provided GPS place. Examples: "Landwer", "beach", "bar patio". Do not invent a venue name that is not in the transcript or the GPS place string. Empty string if nothing is clear.',
  'Contact signals include Instagram, WhatsApp, phone numbers, email, AND Hebrew: וואצאפ, נומר, אינסטגרם.',
  'Schedule signals include tomorrow, tonight, coffee, AND Hebrew: מחר, היום בערב, קופי, שבת.',
  'Rejection signals include not interested, I have a boyfriend, AND Hebrew: לא מעוניין, יש לי חבר, לא תודה.',
  'success is true only when contact was exchanged OR a meetup was scheduled, and the conversation is not a rejection.',
  'valence is a number from -1 (very negative) to 1 (very positive).',
  'summary is exactly 1 sentence, human, in the transcript language (he or en, or mixed if the transcript mixes).',
  'whatWorked is one concrete thing that helped, taken from the transcript, or an empty string if nothing is clear. Not generic.',
  'nextAction is one specific action in the same language as the transcript (e.g. "text Maya about Friday coffee"), or an empty string if none. Never write a generic "follow up".',
  'followUpSuggestion is a short next step or null if none.',
  'placeType is the venue category.',
  'daypart is morning, afternoon, evening, or night.',
  'language is he, en, or mixed based on the transcript.',
  'isApproach is true ONLY if this is the study participant (phone wearer) in a real conversation approaching / talking with a woman.',
  'isApproach is false for: ambient crowd, walking past, other people talking to each other, TV, no wearer speech, not a social approach.',
  'Do not invent. If unsure, isApproach is false.',
  'If the transcript is empty, sentiment is neutral, success is false, isApproach is false, whatWorked and nextAction are empty, and summary says no speech was captured.',
].join(' ')

const PROOF_PROMPT = [
  'You proofread automatic speech-recognition transcripts.',
  'The text may be Hebrew, English, or mixed (code-switching).',
  'Fix punctuation and obvious ASR errors only.',
  'Do not change meaning, names, numbers, or facts.',
  'Return JSON with keys language (he, en, or mixed) and text (the corrected transcript).',
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
    scene: '',
    topics: [],
    commitments: [],
    objections: [],
    questionsAsked: 0,
    energy: 'low',
    summary: 'No speech captured.',
    followUpSuggestion: null,
    whatWorked: '',
    nextAction: '',
    exchangedContact: false,
    scheduled: false,
    rejection: false,
    isApproach: false,
    model,
    placeType: 'other',
    daypart: 'afternoon',
    language: 'en',
  }
}

export function parseProofJson(raw: unknown): ProofResult | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (v.language !== 'he' && v.language !== 'en' && v.language !== 'mixed') return null
  if (typeof v.text !== 'string') return null
  return { language: v.language, text: v.text }
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
  if (v.scene != null && typeof v.scene !== 'string') return null
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
  if (v.whatWorked != null && typeof v.whatWorked !== 'string') return null
  if (v.nextAction != null && typeof v.nextAction !== 'string') return null
  if (typeof v.exchangedContact !== 'boolean') return null
  if (typeof v.scheduled !== 'boolean') return null
  if (typeof v.rejection !== 'boolean') return null
  if (v.isApproach != null && typeof v.isApproach !== 'boolean') return null
  const isApproach = typeof v.isApproach === 'boolean' ? v.isApproach : false
  const model = typeof v.model === 'string' ? v.model : ''
  const placeType =
    typeof v.placeType === 'string' && PLACE_TYPES.includes(v.placeType as PlaceType)
      ? (v.placeType as PlaceType)
      : undefined
  const daypart =
    typeof v.daypart === 'string' && DAYPARTS.includes(v.daypart as Daypart)
      ? (v.daypart as Daypart)
      : undefined
  const language =
    typeof v.language === 'string' && SPOKEN_LANGUAGES.includes(v.language as SpokenLanguage)
      ? (v.language as SpokenLanguage)
      : undefined
  return {
    sentiment: v.sentiment as Sentiment,
    success: v.success,
    valence: v.valence,
    outcome: v.outcome as Outcome,
    who: v.who,
    scene: typeof v.scene === 'string' ? v.scene : '',
    topics,
    commitments,
    objections,
    questionsAsked: v.questionsAsked,
    energy: v.energy as Energy,
    summary: v.summary,
    followUpSuggestion: v.followUpSuggestion,
    whatWorked: typeof v.whatWorked === 'string' ? v.whatWorked : '',
    nextAction: typeof v.nextAction === 'string' ? v.nextAction : '',
    exchangedContact: v.exchangedContact,
    scheduled: v.scheduled,
    rejection: v.rejection,
    isApproach,
    model,
    placeType,
    daypart,
    language,
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

export async function proofTranscript(text: string): Promise<ProofResult> {
  const transcript = (text ?? '').trim()
  if (!transcript) return { language: 'en', text: '' }
  if (!getApiKey()) throw new Error('No OpenAI key')
  const res = await fetch(COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      ...openaiHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: PROOF_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROOF_PROMPT },
        { role: 'user', content: transcript },
      ],
    }),
  })
  if (!res.ok) throw new Error('Proofing failed')
  const json = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[]
  }
  const parsed = parseProofJson(parseMessageContent(json.choices?.[0]?.message?.content))
  if (!parsed) throw new Error('Invalid proof')
  return parsed
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
