import type { Outcome, TranscriptAnalysis } from './types'

const CONTACT_RE =
  /\b(?:instagram|\big\b|snap(?:chat)?|whatsapp|my number|your number|phone number|email)\b|\b[\w.+-]+@[\w.-]+\.\w{2,}\b|@[a-z0-9._]{2,30}\b|\b(?:\+?\d{1,3}[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{10,15}\b|וואצאפ|הואצאפ|וואטסאפ|נומר|מספר|אינסטגרם/i

const SCHEDULE_RE =
  /\b(?:tomorrow|tonight|this weekend|friday|saturday|sunday|coffee|drink|date|call me)\b|מחר|היום בערב|קופי|שבת/i

const CHAT_RE =
  /\b(?:stay in touch|keep in touch|text you|message you|talk later|hit you up|reach out)\b/i

const REJECT_RE =
  /\b(?:gotta go|got to go|not interested|i have a boyfriend|i have a girlfriend|i(?:['’]m| am) seeing someone|no thanks|no thank you)\b|לא מעוניין|יש לי חבר|לא תודה/i

const COMMIT_RE = /\bi(?:['’]ll| will)\b|\blet['’]?s\b|\bwe should\b|\btext me\b|\bmeet\b/i

const QUESTION_START = /^(?:so\s+|and\s+|but\s+)?(?:who|what|where|when|why|how)\b/i
const QUESTION_WORD = /\b(?:who|what|where|when|why|how)\b/i

const TOPIC_WORDS: Record<string, RegExp> = {
  work: /\b(?:work|job|office|career|coworker|boss|startup)\b/i,
  travel: /\b(?:travel|trip|flight|vacation|abroad|visiting)\b/i,
  music: /\b(?:music|song|concert|band|guitar|playlist)\b/i,
  food: /\b(?:food|eat|restaurant|dinner|lunch|pizza|cooking|hungry)\b/i,
  school: /\b(?:school|college|university|class|campus|student)\b/i,
  nightlife: /\b(?:bar|club|nightlife|party|dj)\b/i,
  family: /\b(?:family|mom|dad|sister|brother|parents|kids)\b/i,
}

const NAME_SKIP = new Set([
  'a',
  'the',
  'just',
  'here',
  'not',
  'from',
  'good',
  'really',
  'so',
  'very',
  'sorry',
  'going',
  'trying',
  'doing',
])

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function isQuestionSentence(sentence: string): boolean {
  if (sentence.includes('?')) return true
  const t = sentence.trim()
  return QUESTION_START.test(t) || QUESTION_WORD.test(t)
}

export function exchangedContact(text: string): boolean {
  return CONTACT_RE.test(text)
}

export function isScheduled(text: string): boolean {
  return SCHEDULE_RE.test(text)
}

export function stayingInTouch(text: string): boolean {
  return CHAT_RE.test(text)
}

export function isRejection(text: string): boolean {
  return REJECT_RE.test(text)
}

export function extractCommitments(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const sentence of splitSentences(text)) {
    if (!COMMIT_RE.test(sentence)) continue
    const key = sentence.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sentence)
  }
  return out
}

export function extractTopics(text: string): string[] {
  const hits: string[] = []
  for (const [topic, re] of Object.entries(TOPIC_WORDS)) {
    if (re.test(text)) hits.push(topic)
  }
  return hits
}

export function extractIntroName(text: string): string | null {
  const m = text.match(/\b(?:i(?:['’]m| am)|my name is)\s+([a-z]{2,20})\b/i)
  if (m) {
    const raw = m[1]
    if (!NAME_SKIP.has(raw.toLowerCase())) {
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    }
  }
  const he = text.match(/(?:אני|קוראים לי)\s+([\u0590-\u05FF]{2,20})/)
  if (he) return he[1]
  return null
}

export function tomorrowIso(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export function makeSummary(text: string, durationSec: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return durationSec > 0 ? `No speech captured (${Math.round(durationSec)}s).` : 'No speech captured.'
  }
  if (cleaned.length <= 180) return cleaned
  return `${cleaned.slice(0, 177).trimEnd()}…`
}

export function pickOutcome(input: {
  exchangedContact: boolean
  scheduled: boolean
  stayingInTouch: boolean
  rejection: boolean
  wordCount: number
}): Outcome {
  if (input.exchangedContact) return 'number'
  if (input.scheduled) return 'date'
  if (input.stayingInTouch) return 'chat'
  if (input.rejection) return 'no'
  if (input.wordCount >= 30) return 'talked'
  return 'other'
}

export function analyzeTranscript(
  text: string,
  durationSec: number,
  now = new Date(),
): TranscriptAnalysis {
  const body = text ?? ''
  const words = wordCount(body)
  const questions = splitSentences(body).filter(isQuestionSentence).length
  const contact = exchangedContact(body)
  const scheduled = isScheduled(body)
  const chat = stayingInTouch(body)
  const rejection = isRejection(body)
  const outcome = pickOutcome({
    exchangedContact: contact,
    scheduled,
    stayingInTouch: chat,
    rejection,
    wordCount: words,
  })
  return {
    wordCount: words,
    questionCount: questions,
    exchangedContact: contact,
    scheduled,
    commitments: extractCommitments(body),
    topics: extractTopics(body),
    outcome,
    followUpAt: outcome === 'number' || outcome === 'date' ? tomorrowIso(now) : null,
    summary: makeSummary(body, durationSec),
  }
}
